// Persona prompt generator — creates LLM system prompts from analysis data

import { t, getLang } from './i18n.js';

const TOPIC_LABELS_ZH = {
  food: '美食/吃喝', work: '工作/职场', feelings: '感情/情感',
  daily: '日常生活', entertainment: '娱乐/休闲',
};
const TOPIC_LABELS_EN = {
  food: 'Food & Dining', work: 'Work', feelings: 'Feelings & Romance',
  daily: 'Daily Life', entertainment: 'Entertainment',
};

function formatResponseTime(minutes) {
  if (minutes < 1) return getLang() === 'zh' ? '不到1分钟' : 'under 1 minute';
  if (minutes < 60) return getLang() === 'zh' ? `约${Math.round(minutes)}分钟` : `about ${Math.round(minutes)} minutes`;
  const hours = Math.round(minutes / 60 * 10) / 10;
  return getLang() === 'zh' ? `约${hours}小时` : `about ${hours} hours`;
}

function lengthDesc(avgLen) {
  if (getLang() === 'zh') {
    if (avgLen < 5) return '极简短';
    if (avgLen < 10) return '简短';
    if (avgLen < 20) return '适中';
    return '较长';
  }
  if (avgLen < 5) return 'very terse';
  if (avgLen < 10) return 'short';
  if (avgLen < 20) return 'moderate';
  return 'lengthy';
}

function toneDesc(tone) {
  if (getLang() === 'zh') {
    if (tone > 0.65) return '活泼积极，多用感叹号和正面表达';
    if (tone > 0.4) return '平稳中性，情绪波动不大';
    return '偏冷淡克制，较少主动表达情感';
  }
  if (tone > 0.65) return 'upbeat and positive, uses exclamations and warm language';
  if (tone > 0.4) return 'neutral and steady, not very emotional';
  return 'reserved and restrained, rarely expresses emotions directly';
}

export function generatePrompt(analysis, mode = 'full') {
  if (getLang() === 'zh') return generateZh(analysis, mode);
  return generateEn(analysis, mode);
}

function generateZh(a, mode) {
  const lines = [];

  lines.push(`你是「${a.targetName}」的数字分身，基于${a.messageCount}条真实聊天记录分析生成。请完全模仿以下沟通风格进行对话。`);
  lines.push('');

  // Basic info
  lines.push('## 基本信息');
  lines.push(`- 称呼：${a.targetName}`);
  if (a.timeSpan) lines.push(`- 聊天记录跨度：${a.timeSpan}`);
  lines.push(`- 分析基础：${a.messageCount}条消息`);
  lines.push('');

  // Language style
  lines.push('## 语言风格');
  lines.push(`- 平均每条消息${a.vocabulary.avgLength}个字，偏好${lengthDesc(a.vocabulary.avgLength)}的表达方式`);
  if (a.vocabulary.catchphrases.length > 0) {
    lines.push(`- 常用口头禅：「${a.vocabulary.catchphrases.slice(0, 5).join('」「')}」`);
  }
  if (a.vocabulary.particles.length > 0) {
    const top3 = a.vocabulary.particles.slice(0, 3).map(([p]) => p);
    lines.push(`- 句尾习惯：最常用「${top3.join('」「')}」`);
  }
  lines.push(`- 语气特征：${toneDesc(a.topics.tone)}`);
  lines.push('');

  // Emoji
  if (a.emoji.topEmoji.length > 0) {
    lines.push('## 表情使用');
    const freq = a.emoji.emojiRate > 0.01 ? Math.min(100, Math.round(1 / a.emoji.emojiRate)) : 0;
    if (freq > 0) lines.push(`- 大约每${freq}条消息使用一次表情`);
    lines.push(`- 最爱表情：${a.emoji.topEmoji.join(' ')}`);
    lines.push('');
  }

  // Response patterns (full mode only)
  if (mode === 'full' && a.response) {
    lines.push('## 回复模式');
    lines.push(`- 平均回复时间：${formatResponseTime(a.response.avgTime)}`);
    const initPct = Math.round(a.response.initiativeRate * 100);
    lines.push(`- 主动发起对话：约${initPct}%的对话由TA先开始`);
    lines.push('');
  }

  // Topics (full mode only)
  if (mode === 'full' && a.topics.topTopics.length > 0) {
    lines.push('## 话题偏好');
    const topicLabels = a.topics.topTopics.slice(0, 3).map(t => TOPIC_LABELS_ZH[t] || t);
    lines.push(`- 最常聊：${topicLabels.join('、')}`);
    const qPct = Math.round(a.topics.questionRate * 100);
    lines.push(`- 提问频率：约${qPct}%的消息包含提问`);
    lines.push('');
  }

  // Representative messages
  if (a.representatives.length > 0) {
    lines.push('## 对话示例（真实风格摘录）');
    for (const msg of a.representatives.slice(0, mode === 'full' ? 8 : 4)) {
      lines.push(`> ${msg}`);
    }
    lines.push('');
  }

  // Rules
  lines.push('## 重要规则');
  lines.push('1. 保持上述语言风格的一致性');
  lines.push(`2. 消息长度控制在${Math.max(1, Math.round(a.vocabulary.avgLength * 0.5))}-${Math.round(a.vocabulary.avgLength * 1.5)}个字`);
  if (a.emoji.topEmoji.length > 0) {
    lines.push('3. 按上述频率自然加入表情');
  }
  lines.push(`${a.emoji.topEmoji.length > 0 ? '4' : '3'}. 用对话的方式回复，不要写长篇大论`);
  lines.push(`${a.emoji.topEmoji.length > 0 ? '5' : '4'}. 不确定时可以用「${a.vocabulary.catchphrases[0] || '嗯'}」「${a.vocabulary.catchphrases[1] || '好吧'}」来回应`);

  return lines.join('\n');
}

function generateEn(a, mode) {
  const lines = [];

  lines.push(`You are a digital clone of "${a.targetName}", generated from ${a.messageCount} real chat messages. Replicate the following communication style exactly.`);
  lines.push('');

  lines.push('## Basic Info');
  lines.push(`- Name: ${a.targetName}`);
  if (a.timeSpan) lines.push(`- Chat history span: ${a.timeSpan}`);
  lines.push(`- Analysis basis: ${a.messageCount} messages`);
  lines.push('');

  lines.push('## Language Style');
  lines.push(`- Average message length: ${a.vocabulary.avgLength} characters, tends to be ${lengthDesc(a.vocabulary.avgLength)}`);
  if (a.vocabulary.catchphrases.length > 0) {
    lines.push(`- Catchphrases: "${a.vocabulary.catchphrases.slice(0, 5).join('", "')}"`);
  }
  lines.push(`- Tone: ${toneDesc(a.topics.tone)}`);
  lines.push('');

  if (a.emoji.topEmoji.length > 0) {
    lines.push('## Emoji Usage');
    lines.push(`- Favorite emoji: ${a.emoji.topEmoji.join(' ')}`);
    lines.push('');
  }

  if (mode === 'full' && a.response) {
    lines.push('## Response Patterns');
    lines.push(`- Average response time: ${formatResponseTime(a.response.avgTime)}`);
    lines.push('');
  }

  if (a.representatives.length > 0) {
    lines.push('## Example Messages (real style samples)');
    for (const msg of a.representatives.slice(0, mode === 'full' ? 8 : 4)) {
      lines.push(`> ${msg}`);
    }
    lines.push('');
  }

  lines.push('## Rules');
  lines.push('1. Maintain consistent style as described above');
  lines.push(`2. Keep messages around ${Math.round(a.vocabulary.avgLength)} characters`);
  lines.push('3. Reply conversationally, not in essays');

  return lines.join('\n');
}
