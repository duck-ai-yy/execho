import { t, setLang, getLang } from './i18n.js';
import { parseChat } from './parser.js';
import { analyze } from './analyzer.js';
import { generatePrompt } from './generator.js';
import { sampleChat, sampleExName } from './sample-data.js';
import { recognizeImages, classifyLines, ocrToParseResult } from './ocr.js';

// ---- State ----
let parsedData = null;
let selectedEx = null;
let analysisResult = null;
let currentPromptMode = 'full';
let isDemo = false;
let currentTab = 'screenshot'; // 'screenshot' or 'text'
let uploadedFiles = [];

// ---- DOM refs ----
const $ = id => document.getElementById(id);

const inputSection = $('input-section');
const speakerSection = $('speaker-section');
const loadingSection = $('loading-section');
const analysisSection = $('analysis-section');
const promptSection = $('prompt-section');
const shareSection = $('share-section');
const demoBanner = $('demo-banner');
const textInput = $('text-input');
const inputError = $('input-error');
const speakerCards = $('speaker-cards');

// ---- Helpers ----
function show(...els) { els.forEach(el => el.classList.remove('hidden')); }
function hide(...els) { els.forEach(el => el.classList.add('hidden')); }

function hideAll() {
  hide(inputSection, speakerSection, loadingSection, analysisSection, promptSection, shareSection, demoBanner);
}

function showError(msg) {
  inputError.textContent = msg;
  show(inputError);
}

// Escape HTML to prevent XSS
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.textContent;
}

// Create element helper
function el(tag, attrs = {}, children = []) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') elem.className = v;
    else if (k === 'style') elem.style.cssText = v;
    else if (k === 'text') elem.textContent = v;
    else elem.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
    else if (child) elem.appendChild(child);
  }
  return elem;
}

// ---- Tab switching ----
const panelScreenshot = $('panel-screenshot');
const panelText = $('panel-text');
const tabScreenshot = $('tab-screenshot');
const tabText = $('tab-text');

function switchTab(tab) {
  currentTab = tab;
  if (tab === 'screenshot') {
    tabScreenshot.classList.add('active');
    tabText.classList.remove('active');
    show(panelScreenshot);
    hide(panelText);
  } else {
    tabText.classList.add('active');
    tabScreenshot.classList.remove('active');
    show(panelText);
    hide(panelScreenshot);
    textInput.placeholder = t('input.placeholder');
  }
}

tabScreenshot.addEventListener('click', () => switchTab('screenshot'));
tabText.addEventListener('click', () => switchTab('text'));

// ---- Upload handling ----
const uploadZone = $('upload-zone');
const fileInput = $('file-input');
const ocrPreviews = $('ocr-previews');
const ocrProgressWrap = $('ocr-progress-wrap');
const ocrProgress = $('ocr-progress');
const ocrStatus = $('ocr-status');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

function handleFiles(fileList) {
  const newFiles = [...fileList].filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) return;

  uploadedFiles = [...uploadedFiles, ...newFiles];
  renderThumbnails();
}

function renderThumbnails() {
  // Revoke old ObjectURLs to prevent memory leaks
  ocrPreviews.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  ocrPreviews.replaceChildren();
  for (const file of uploadedFiles) {
    const img = document.createElement('img');
    img.className = 'ocr-thumb';
    img.src = URL.createObjectURL(file);
    ocrPreviews.appendChild(img);
  }
}

// ---- Flow: Hero buttons ----
$('btn-upload').addEventListener('click', () => {
  isDemo = false;
  hide(demoBanner);
  show(inputSection);
  switchTab('screenshot');
});

$('btn-paste').addEventListener('click', () => {
  isDemo = false;
  hide(demoBanner);
  show(inputSection);
  switchTab('text');
  textInput.focus();
});

$('btn-demo').addEventListener('click', () => {
  isDemo = true;
  hideAll();
  show(demoBanner);
  parsedData = parseChat(sampleChat);
  selectedEx = sampleExName;
  runAnalysis();
});

// ---- Flow: Analyze button ----
$('btn-analyze').addEventListener('click', async () => {
  hide(inputError);

  if (currentTab === 'text') {
    // Text mode (existing flow)
    const raw = textInput.value.trim();
    if (!raw) {
      showError(t('error.parseFail'));
      return;
    }

    parsedData = parseChat(raw);

    if (parsedData.messages.length < 10) {
      showError(t('error.tooFew'));
      return;
    }
    if (parsedData.speakers.length < 2) {
      showError(t('error.parseFail'));
      return;
    }

    hide(inputSection);
    showSpeakerSelection();

  } else {
    // OCR mode
    if (uploadedFiles.length === 0) {
      showError(t('ocr.noText'));
      return;
    }

    // Show progress
    show(ocrProgressWrap);
    ocrStatus.textContent = t('ocr.loading');
    ocrProgress.style.width = '5%';

    try {
      const lines = await recognizeImages(uploadedFiles, (progress, current, total) => {
        const overallProgress = ((current + progress) / total) * 100;
        ocrProgress.style.width = `${Math.min(95, overallProgress)}%`;
        ocrStatus.textContent = t('ocr.recognizing')
          .replace('{current}', current + 1)
          .replace('{total}', total);
      });

      ocrProgress.style.width = '100%';
      ocrStatus.textContent = t('ocr.done');

      if (lines.length === 0) {
        showError(t('ocr.noText'));
        hide(ocrProgressWrap);
        return;
      }

      // Check average confidence
      const avgConfidence = lines.reduce((a, l) => a + l.confidence, 0) / lines.length;
      if (avgConfidence < 40) {
        showError(t('ocr.lowConfidence'));
      }

      // Classify lines by position
      const classified = classifyLines(lines);
      parsedData = ocrToParseResult(classified);

      if (parsedData.messages.length < 5) {
        showError(t('error.tooFew'));
        hide(ocrProgressWrap);
        return;
      }

      hide(inputSection, ocrProgressWrap);
      showSpeakerSelection();

    } catch (err) {
      console.error('OCR error:', err);
      showError(t('ocr.noText'));
      hide(ocrProgressWrap);
    }
  }
});

// ---- Flow: Speaker selection ----
function showSpeakerSelection() {
  speakerCards.replaceChildren();
  for (const speaker of parsedData.speakers) {
    const card = document.createElement('button');
    card.className = 'speaker-card';
    card.textContent = speaker;
    card.addEventListener('click', () => {
      speakerCards.querySelectorAll('.speaker-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedEx = speaker;
    });
    speakerCards.appendChild(card);
  }
  show(speakerSection);
}

$('btn-confirm-speaker').addEventListener('click', () => {
  if (!selectedEx) return;
  hide(speakerSection);
  runAnalysis();
});

// ---- Flow: Analysis ----
function runAnalysis() {
  show(loadingSection);
  setTimeout(() => {
    analysisResult = analyze(parsedData.messages, selectedEx);
    hide(loadingSection);
    renderAnalysis();
    renderPrompt();
    show(analysisSection, promptSection, shareSection);
  }, 600);
}

// ---- Render: Analysis dashboard ----
function renderAnalysis() {
  // Meta
  const meta = $('analysis-meta');
  let metaText = `${esc(analysisResult.targetName)} · ${analysisResult.messageCount} ${t('analysis.messages')}`;
  if (analysisResult.timeSpan) metaText += ` · ${analysisResult.timeSpan}`;
  meta.textContent = metaText;

  // Scores
  const scoreKeys = ['warmth', 'responsiveness', 'expressiveness', 'engagement', 'compatibility'];
  const grid = $('scores-grid');
  grid.replaceChildren();

  for (const key of scoreKeys) {
    const score = analysisResult.scores[key];
    const label = t(`score.${key}`);
    const tag = getScoreTag(key, score);

    const item = el('div', { class: 'score-item' }, [
      el('div', { class: 'score-gauge', style: `--score: ${score}`, text: String(score) }),
      el('div', { class: 'score-label', text: label }),
      el('div', { class: 'score-tag', text: tag }),
    ]);
    grid.appendChild(item);
  }

  // Radar chart
  renderRadar(scoreKeys.map(k => analysisResult.scores[k]));

  // Chat preview
  renderChatPreview();

  // Detail sections
  renderDetails();
}

function getScoreTag(key, score) {
  if (score >= 85) return t(`${key}.high`);
  if (score >= 50) return t(`${key}.mid`);
  return t(`${key}.low`);
}

// ---- Render: Radar chart (SVG) ----
function renderRadar(scores) {
  const svg = $('radar-chart');
  const cx = 110, cy = 110, r = 85;
  const n = scores.length;

  function getPoint(index, value) {
    const angle = (Math.PI * 2 * index / n) - Math.PI / 2;
    const dist = (value / 100) * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  }

  // Build SVG with DOM API (no innerHTML)
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const ns = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // Background grid
  for (const pct of [0.25, 0.5, 0.75, 1]) {
    const points = Array.from({ length: n }, (_, i) => getPoint(i, pct * 100).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points, fill: 'none', stroke: '#e0e0e0', 'stroke-width': '0.5' }));
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const [x, y] = getPoint(i, 100);
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#e0e0e0', 'stroke-width': '0.5' }));
  }

  // Data polygon
  const dataPoints = scores.map((s, i) => getPoint(i, s).join(',')).join(' ');
  svg.appendChild(svgEl('polygon', { points: dataPoints, fill: 'rgba(7,193,96,0.2)', stroke: '#07C160', 'stroke-width': '2' }));

  // Dots
  scores.forEach((s, i) => {
    const [x, y] = getPoint(i, s);
    svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, fill: '#07C160' }));
  });

  // Labels
  const labels = [t('score.warmth'), t('score.responsiveness'), t('score.expressiveness'), t('score.engagement'), t('score.compatibility')];
  labels.forEach((label, i) => {
    const [x, y] = getPoint(i, 120);
    const text = svgEl('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': '11', fill: '#999' });
    text.textContent = label;
    svg.appendChild(text);
  });
}

// ---- Render: Chat preview ----
function renderChatPreview() {
  const preview = $('chat-preview');
  preview.replaceChildren();
  for (const msg of analysisResult.representatives.slice(0, 5)) {
    const bubble = el('div', { class: 'chat-bubble ex', text: msg });
    preview.appendChild(bubble);
  }
}

// ---- Render: Detail sections ----
function renderDetails() {
  const container = $('detail-sections');
  container.replaceChildren();

  const sections = [
    { key: 'vocabulary', render: renderVocabularyDetail },
    { key: 'emoji', render: renderEmojiDetail },
    { key: 'topics', render: renderTopicDetail },
  ];

  if (analysisResult.response) {
    sections.splice(2, 0, { key: 'response', render: renderResponseDetail });
  }

  for (const { key, render } of sections) {
    const section = document.createElement('div');
    section.className = 'detail-section';

    const header = document.createElement('div');
    header.className = 'detail-header';

    const h3 = el('h3', { text: t(`detail.${key}`) });
    const toggle = el('button', { class: 'detail-toggle', text: '▼' });
    header.appendChild(h3);
    header.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'detail-content';
    render(content);

    header.addEventListener('click', () => {
      content.classList.toggle('open');
      toggle.classList.toggle('open');
    });

    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
  }
}

function renderVocabularyDetail(parent) {
  const v = analysisResult.vocabulary;

  // Avg length row
  const row1 = el('div', { class: 'detail-row' }, [
    el('span', { class: 'label', text: t('detail.avgLength') }),
    el('span', { class: 'value', text: `${v.avgLength} ${t('detail.chars')}` }),
  ]);
  parent.appendChild(row1);

  // Catchphrases
  if (v.catchphrases.length > 0) {
    parent.appendChild(el('div', { class: 'detail-row' }, [
      el('span', { class: 'label', text: t('detail.catchphrases') }),
    ]));
    const tagList = el('div', { class: 'tag-list' });
    for (const p of v.catchphrases) {
      tagList.appendChild(el('span', { class: 'tag', text: `「${p}」` }));
    }
    parent.appendChild(tagList);
  }

  // Particles
  if (v.particles.length > 0) {
    const row = el('div', { class: 'detail-row', style: 'margin-top:8px' }, [
      el('span', { class: 'label', text: t('detail.particles') }),
    ]);
    parent.appendChild(row);
    const tagList = el('div', { class: 'tag-list' });
    for (const [p, c] of v.particles.slice(0, 6)) {
      tagList.appendChild(el('span', { class: 'tag', text: `${p} ×${c}` }));
    }
    parent.appendChild(tagList);
  }
}

function renderEmojiDetail(parent) {
  const e = analysisResult.emoji;
  if (e.topEmoji.length > 0) {
    parent.appendChild(el('div', { class: 'detail-row' }, [
      el('span', { class: 'label', text: t('detail.topEmoji') }),
      el('span', { class: 'value', text: e.topEmoji.join(' ') }),
    ]));
  }
  parent.appendChild(el('div', { class: 'detail-row' }, [
    el('span', { class: 'label', text: t('detail.emojiRate') }),
    el('span', { class: 'value', text: `${Math.round(e.emojiRate * 100)}%` }),
  ]));
}

function renderResponseDetail(parent) {
  const r = analysisResult.response;
  const formatTime = (min) => {
    if (min < 1) return getLang() === 'zh' ? '<1分钟' : '<1min';
    if (min < 60) return getLang() === 'zh' ? `${Math.round(min)}分钟` : `${Math.round(min)}min`;
    return getLang() === 'zh' ? `${(min / 60).toFixed(1)}小时` : `${(min / 60).toFixed(1)}h`;
  };

  parent.appendChild(el('div', { class: 'detail-row' }, [
    el('span', { class: 'label', text: t('detail.avgResponse') }),
    el('span', { class: 'value', text: formatTime(r.avgTime) }),
  ]));
  parent.appendChild(el('div', { class: 'detail-row' }, [
    el('span', { class: 'label', text: t('detail.initiative') }),
    el('span', { class: 'value', text: `${Math.round(r.initiativeRate * 100)}%` }),
  ]));
}

function renderTopicDetail(parent) {
  const tp = analysisResult.topics;
  const topicLabels = {
    food: getLang() === 'zh' ? '美食' : 'Food',
    work: getLang() === 'zh' ? '工作' : 'Work',
    feelings: getLang() === 'zh' ? '感情' : 'Feelings',
    daily: getLang() === 'zh' ? '日常' : 'Daily',
    entertainment: getLang() === 'zh' ? '娱乐' : 'Fun',
  };

  const sorted = tp.topTopics.slice(0, 4);
  const tone = tp.tone > 0.6 ? t('detail.positive') : tp.tone < 0.4 ? t('detail.negative') : t('detail.neutral');

  parent.appendChild(el('div', { class: 'detail-row' }, [
    el('span', { class: 'label', text: t('detail.topTopics') }),
  ]));
  const tagList = el('div', { class: 'tag-list' });
  for (const k of sorted) {
    tagList.appendChild(el('span', { class: 'tag', text: topicLabels[k] || k }));
  }
  parent.appendChild(tagList);

  parent.appendChild(el('div', { class: 'detail-row', style: 'margin-top:8px' }, [
    el('span', { class: 'label', text: t('detail.emotion') }),
    el('span', { class: 'value', text: tone }),
  ]));
}

// ---- Render: Prompt ----
function renderPrompt() {
  const content = $('prompt-content');
  content.textContent = generatePrompt(analysisResult, currentPromptMode);
}

// Prompt tab switching
document.querySelectorAll('.prompt-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.prompt-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentPromptMode = tab.dataset.mode;
    renderPrompt();
  });
});

// ---- Copy ----
$('btn-copy').addEventListener('click', async () => {
  const prompt = generatePrompt(analysisResult, currentPromptMode);
  try {
    await navigator.clipboard.writeText(prompt);
    const btn = $('btn-copy');
    btn.textContent = t('btn.copy.done');
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = t('btn.copy');
      btn.classList.remove('copied');
    }, 2000);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = prompt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
});

// ---- Share image generation ----
$('btn-download').addEventListener('click', () => {
  const canvas = $('share-canvas');
  const ctx = canvas.getContext('2d');
  const w = 1080, h = 1920;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#07C160');
  grad.addColorStop(1, '#04a553');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // White card
  const cardY = 200, cardH = 1400;
  ctx.fillStyle = 'white';
  roundRect(ctx, 60, cardY, w - 120, cardH, 30);

  // Title
  ctx.fillStyle = '#111';
  ctx.font = 'bold 56px -apple-system, PingFang SC, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('前任回声 ExEcho', w / 2, cardY + 80);

  // Target name
  ctx.font = '36px -apple-system, PingFang SC, sans-serif';
  ctx.fillStyle = '#666';
  ctx.fillText(`「${esc(analysisResult.targetName)}」的沟通画像`, w / 2, cardY + 140);

  // Score circles
  const scoreKeys = ['warmth', 'responsiveness', 'expressiveness', 'engagement', 'compatibility'];
  const scoreLabels = [t('score.warmth'), t('score.responsiveness'), t('score.expressiveness'), t('score.engagement'), t('score.compatibility')];

  const cols = 3;
  const startX = 160, startY = cardY + 240, gapX = 300, gapY = 280;

  scoreKeys.forEach((key, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    let cx = startX + col * gapX;
    let cy = startY + row * gapY;
    if (row === 1) cx = startX + (col + 0.5) * gapX;

    const score = analysisResult.scores[key];
    const tag = getScoreTag(key, score);

    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 70, -Math.PI / 2, -Math.PI / 2 + (score / 100) * Math.PI * 2);
    ctx.strokeStyle = '#07C160';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#07C160';
    ctx.font = 'bold 42px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(score), cx, cy + 14);

    ctx.fillStyle = '#999';
    ctx.font = '24px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(scoreLabels[i], cx, cy + 100);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 26px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(tag, cx, cy + 135);
  });

  // CTA
  ctx.fillStyle = '#999';
  ctx.font = '28px -apple-system, PingFang SC, sans-serif';
  ctx.fillText('搜索 ExEcho 试试你的', w / 2, cardY + cardH - 80);

  // Branding
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 32px -apple-system, sans-serif';
  ctx.fillText('ExEcho 前任回声', w / 2, h - 80);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '24px -apple-system, sans-serif';
  ctx.fillText('不是为了回去，是为了看清', w / 2, h - 40);

  // Download
  const link = document.createElement('a');
  link.download = `execho-${analysisResult.targetName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ---- Restart ----
$('btn-restart').addEventListener('click', () => {
  hideAll();
  hide(ocrProgressWrap);
  parsedData = null;
  selectedEx = null;
  analysisResult = null;
  isDemo = false;
  uploadedFiles = [];
  ocrPreviews.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  ocrPreviews.replaceChildren();
  textInput.value = '';
  window.scrollTo(0, 0);
});

// ---- Language toggle ----
$('lang-toggle').addEventListener('click', () => {
  setLang(getLang() === 'zh' ? 'en' : 'zh');
  if (analysisResult) {
    renderAnalysis();
    renderPrompt();
  }
});

// ---- Init ----
setLang(getLang());
