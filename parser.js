// Chat text parser — supports 4 common WeChat export formats

const FORMAT = { EXPORT: 'export', COLON_ZH: 'colon_zh', BRACKET: 'bracket', COLON_EN: 'colon_en' };

const PATTERNS = {
  // 名字 2024-03-15 14:23
  export: /^(.{1,20})\s+(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})\s*$/,
  // 名字：消息 or 名字: 消息
  colonZh: /^(.{1,20})[：:]\s*(.+)$/,
  // [名字] 消息
  bracket: /^\[(.{1,20})\]\s*(.+)$/,
};

const MSG_TYPE_PATTERNS = [
  [/^\[图片\]$|^\[Photo\]$/i, 'image'],
  [/^\[语音\]|^\[Voice\]/i, 'voice'],
  [/^\[表情\]|^\[Sticker\]/i, 'sticker'],
  [/^\[红包\]|^\[Red Packet\]/i, 'red_packet'],
  [/^\[链接\]|^\[Link\]/i, 'link'],
  [/^\[视频\]|^\[Video\]/i, 'video'],
  [/^[\p{Emoji_Presentation}\p{Emoji}\u200d]+$/u, 'emoji_only'],
];

function classifyMessage(text) {
  for (const [pattern, type] of MSG_TYPE_PATTERNS) {
    if (pattern.test(text.trim())) return type;
  }
  return 'text';
}

function parseTimestamp(str) {
  if (!str) return null;
  // Handle: 2024-03-15 14:23
  const m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Handle: 14:23 (time only)
  const t = str.match(/^(\d{1,2}):(\d{2})$/);
  if (t) return new Date(2024, 0, 1, +t[1], +t[2]);
  return null;
}

function detectFormat(lines) {
  let scores = { [FORMAT.EXPORT]: 0, [FORMAT.COLON_ZH]: 0, [FORMAT.BRACKET]: 0, [FORMAT.COLON_EN]: 0 };
  const sample = lines.slice(0, 30);

  for (const line of sample) {
    if (PATTERNS.export.test(line)) scores[FORMAT.EXPORT] += 2;
    if (PATTERNS.bracket.test(line)) scores[FORMAT.BRACKET]++;
    if (PATTERNS.colonZh.test(line)) scores[FORMAT.COLON_ZH]++;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : FORMAT.COLON_ZH; // default fallback
}

function parseExportFormat(lines) {
  const messages = [];
  let currentSpeaker = null;
  let currentTimestamp = null;
  let buffer = [];

  for (const line of lines) {
    const headerMatch = line.match(PATTERNS.export);
    if (headerMatch) {
      // Flush previous message
      if (currentSpeaker && buffer.length > 0) {
        const text = buffer.join('\n').trim();
        if (text) {
          messages.push({
            speaker: currentSpeaker,
            text,
            timestamp: currentTimestamp,
            type: classifyMessage(text),
          });
        }
      }
      currentSpeaker = headerMatch[1].trim();
      currentTimestamp = parseTimestamp(headerMatch[2]);
      buffer = [];
    } else if (line.trim()) {
      buffer.push(line.trim());
    }
  }
  // Flush last
  if (currentSpeaker && buffer.length > 0) {
    const text = buffer.join('\n').trim();
    if (text) {
      messages.push({
        speaker: currentSpeaker,
        text,
        timestamp: currentTimestamp,
        type: classifyMessage(text),
      });
    }
  }
  return messages;
}

function parseColonFormat(lines) {
  const messages = [];
  for (const line of lines) {
    const match = line.match(PATTERNS.colonZh);
    if (match) {
      const text = match[2].trim();
      messages.push({
        speaker: match[1].trim(),
        text,
        timestamp: null,
        type: classifyMessage(text),
      });
    }
  }
  return messages;
}

function parseBracketFormat(lines) {
  const messages = [];
  for (const line of lines) {
    const match = line.match(PATTERNS.bracket);
    if (match) {
      const text = match[2].trim();
      messages.push({
        speaker: match[1].trim(),
        text,
        timestamp: null,
        type: classifyMessage(text),
      });
    }
  }
  return messages;
}

export function parseChat(rawText) {
  const lines = rawText.split('\n').filter(l => l.trim());
  const format = detectFormat(lines);

  let messages;
  switch (format) {
    case FORMAT.EXPORT:
      messages = parseExportFormat(lines);
      break;
    case FORMAT.BRACKET:
      messages = parseBracketFormat(lines);
      break;
    default:
      messages = parseColonFormat(lines);
  }

  // Extract unique speakers
  const speakers = [...new Set(messages.map(m => m.speaker))];

  return { messages, speakers, format };
}
