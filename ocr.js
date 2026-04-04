// OCR module — Tesseract.js wrapper with WeChat screenshot preprocessing
// Uses spatial analysis of bounding boxes to identify speakers (left=other, right=self)

// ---- Image Preprocessing ----

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function preprocessImage(img) {
  const canvas = document.createElement('canvas');
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // Crop top ~7% (status bar) and bottom ~6% (input bar)
  const cropTop = Math.round(h * 0.07);
  const cropBottom = Math.round(h * 0.06);
  const cropH = h - cropTop - cropBottom;

  // Scale up small images for better OCR
  const scale = w < 1000 ? 2 : 1;
  canvas.width = w * scale;
  canvas.height = cropH * scale;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, cropTop, w, cropH, 0, 0, w * scale, cropH * scale);

  // Convert to grayscale + enhance contrast
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  // Histogram stretch
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = Math.round(((data[i] - min) / range) * 255);
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ---- OCR Execution ----

export async function recognizeImages(files, onProgress) {
  let currentFileIndex = 0;
  const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress, currentFileIndex, files.length);
      }
    },
  });

  const allLines = [];

  try {
    for (let i = 0; i < files.length; i++) {
      currentFileIndex = i;
      const img = await loadImage(files[i]);
      const preprocessed = preprocessImage(img);
      URL.revokeObjectURL(img.src);

      const { data } = await worker.recognize(preprocessed);

      const imgWidth = preprocessed.width;
      for (const line of data.lines) {
        allLines.push({
          text: line.text.trim(),
          x: line.bbox.x0,
          xEnd: line.bbox.x1,
          imgWidth,
          confidence: line.confidence,
        });
      }
    }
  } finally {
    await worker.terminate();
  }

  return allLines;
}

// ---- Spatial Speaker Identification ----
// WeChat layout: left side (<40%) = other person, right side (>55%) = self, center = timestamps

export function classifyLines(lines) {
  const messages = [];
  let buffer = { left: [], right: [], center: [] };

  function flushBuffer() {
    // Flush left (other person's messages)
    if (buffer.left.length > 0) {
      const text = buffer.left.join(' ').trim();
      if (text && !isSystemMessage(text)) {
        messages.push({ speaker: 'left', text, type: classifyType(text) });
      }
    }
    // Flush right (self messages)
    if (buffer.right.length > 0) {
      const text = buffer.right.join(' ').trim();
      if (text && !isSystemMessage(text)) {
        messages.push({ speaker: 'right', text, type: classifyType(text) });
      }
    }
    // Center lines are timestamps or system messages — extract timestamp
    if (buffer.center.length > 0) {
      const centerText = buffer.center.join(' ');
      const ts = extractTimestamp(centerText);
      if (ts && messages.length > 0) {
        // Attach to next message if possible, or last message
        messages[messages.length - 1].timestamp = ts;
      }
    }
    buffer = { left: [], right: [], center: [] };
  }

  for (const line of lines) {
    if (!line.text || line.confidence < 30) continue;

    const centerX = (line.x + line.xEnd) / 2;
    const relativeCenter = centerX / line.imgWidth;

    // Determine position
    let position;
    if (relativeCenter < 0.40) {
      position = 'left';
    } else if (relativeCenter > 0.55) {
      position = 'right';
    } else {
      position = 'center';
    }

    // If position changes from previous non-center, flush
    const lastPosition = buffer.left.length > 0 ? 'left' : buffer.right.length > 0 ? 'right' : null;
    if (lastPosition && position !== 'center' && position !== lastPosition) {
      flushBuffer();
    }

    buffer[position].push(line.text);
  }

  flushBuffer();
  return messages;
}

// ---- Helpers ----

function isSystemMessage(text) {
  const systemPatterns = [
    /撤回了一条消息/,
    /recalled a message/i,
    /以上是打招呼的内容/,
    /你已添加/,
    /You have added/i,
    /^-+$/,
  ];
  return systemPatterns.some(p => p.test(text));
}

function extractTimestamp(text) {
  // Match common WeChat timestamp formats
  const patterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/,
    /(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/,
    /(\d{1,2}):(\d{2})/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (m.length >= 6) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      if (m.length >= 5) return new Date(2024, +m[1] - 1, +m[2], +m[3], +m[4]);
      if (m.length >= 3) return new Date(2024, 0, 1, +m[1], +m[2]);
    }
  }
  return null;
}

function classifyType(text) {
  const types = [
    [/^\[图片\]$|^\[Photo\]$/i, 'image'],
    [/^\[语音\]|^\[Voice\]/i, 'voice'],
    [/^\[表情\]|^\[Sticker\]/i, 'sticker'],
    [/^\[红包\]|^\[Red Packet\]/i, 'red_packet'],
    [/^\[视频\]|^\[Video\]/i, 'video'],
    [/^[\p{Emoji_Presentation}\p{Emoji}\u200d]+$/u, 'emoji_only'],
  ];
  for (const [pattern, type] of types) {
    if (pattern.test(text.trim())) return type;
  }
  return 'text';
}

// ---- Build parsed result compatible with parser.js output ----

export function ocrToParseResult(classifiedLines) {
  // Convert left/right to speaker names
  // User will select which one is the ex in the speaker selection step
  const messages = classifiedLines.map(m => ({
    speaker: m.speaker === 'left' ? '对方' : '我',
    text: m.text,
    timestamp: m.timestamp || null,
    type: m.type,
  }));

  const speakers = [...new Set(messages.map(m => m.speaker))];
  return { messages, speakers, format: 'ocr' };
}
