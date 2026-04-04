// Communication pattern analysis engine — 5 dimensions

// ---- Helpers ----

function extractEmoji(text) {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  return text.match(emojiRegex) || [];
}

function countMatches(text, patterns) {
  let count = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) count += m.length;
  }
  return count;
}

// Simple bigram/trigram frequency for catchphrase detection
function findCatchphrases(texts, minOccurrences = 3) {
  const freq = {};
  for (const text of texts) {
    // Extract 2-char, 3-char, 4-char substrings
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const gram = text.slice(i, i + len);
        // Skip if it's all punctuation or whitespace
        if (/^[\s\p{P}]+$/u.test(gram)) continue;
        freq[gram] = (freq[gram] || 0) + 1;
      }
    }
  }

  // Filter by min occurrences, sort by frequency
  let candidates = Object.entries(freq)
    .filter(([, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] - a[1]);

  // Remove substrings of higher-frequency longer strings
  const result = [];
  for (const [phrase, count] of candidates) {
    const isSubstring = result.some(([longer]) => longer.includes(phrase) && longer !== phrase);
    if (!isSubstring) result.push([phrase, count]);
  }

  return result.slice(0, 10);
}

// ---- Topic detection ----
const TOPIC_KEYWORDS = {
  food: ['吃', '饭', '外卖', '好吃', '餐', '火锅', '奶茶', '咖啡', '饿', '日料', '烧烤', '甜品'],
  work: ['上班', '加班', '老板', '公司', '项目', '会议', '工作', '客户', '忙', '累'],
  feelings: ['想你', '爱', '喜欢', '心', '开心', '难过', '抱歉', '对不起', '幸福', '宝贝', '亲爱'],
  daily: ['睡了', '起床', '洗澡', '回家', '出门', '天气', '早安', '晚安', '周末', '明天'],
  entertainment: ['电影', '游戏', '综艺', '剧', '音乐', '歌', '看书', '逛街', '旅游', '爬山'],
};

function detectTopics(texts) {
  const counts = {};
  let total = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let count = 0;
    for (const text of texts) {
      for (const kw of keywords) {
        if (text.includes(kw)) { count++; break; }
      }
    }
    counts[topic] = count;
    total += count;
  }
  // Normalize
  const dist = {};
  for (const [topic, count] of Object.entries(counts)) {
    dist[topic] = total > 0 ? count / total : 0;
  }
  return dist;
}

// ---- Sentence-ending particles ----
const PARTICLES = ['啊', '呢', '吧', '嘛', '哦', '噢', '哈', '嗯', '呀', '啦', '吗', '哇', '呐', '嘿', '喽'];

function countParticles(texts) {
  const counts = {};
  for (const p of PARTICLES) counts[p] = 0;
  for (const text of texts) {
    const lastChar = text.trim().slice(-1);
    if (PARTICLES.includes(lastChar)) counts[lastChar]++;
    // Also count 哈哈哈 patterns
    const hahaMatch = text.match(/哈/g);
    if (hahaMatch) counts['哈'] += hahaMatch.length;
  }
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
}

// ---- Emotional tone ----
const POSITIVE_MARKERS = ['哈哈', '开心', '❤', '好的', '太好了', '喜欢', '爱', '快乐', '幸福', '棒', '😘', '😊', '🥰', '❤️', '嘿嘿', '耶'];
const NEGATIVE_MARKERS = ['烦', '累', '算了', '不想', '生气', '难过', '无聊', '唉', '哎', '😩', '😤', '😢', '不开心', '好吧'];

function emotionalTone(texts) {
  let pos = 0, neg = 0;
  for (const text of texts) {
    for (const m of POSITIVE_MARKERS) { if (text.includes(m)) pos++; }
    for (const m of NEGATIVE_MARKERS) { if (text.includes(m)) neg++; }
  }
  const total = pos + neg;
  if (total === 0) return 0.5;
  return pos / total; // 0 = very negative, 1 = very positive
}

// ---- Response time analysis ----
function analyzeResponseTimes(messages, exName) {
  const times = [];
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    if (!prev.timestamp || !curr.timestamp) continue;
    if (curr.speaker === exName && prev.speaker !== exName) {
      const delta = (curr.timestamp - prev.timestamp) / 60000; // minutes
      if (delta > 0 && delta < 1440) { // within 24 hours
        times.push(delta);
      }
    }
  }

  if (times.length === 0) return null;

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const fast = times.filter(t => t < 1).length / times.length;
  const normal = times.filter(t => t >= 1 && t < 10).length / times.length;
  const slow = times.filter(t => t >= 10 && t < 60).length / times.length;
  const verySlow = times.filter(t => t >= 60).length / times.length;

  return { avg, distribution: { fast, normal, slow, verySlow } };
}

// ---- Conversation initiative ----
function analyzeInitiative(messages, exName) {
  // Requires timestamps to detect conversation boundaries
  const hasTimestamps = messages.filter(m => m.timestamp).length >= messages.length * 0.5;
  if (!hasTimestamps) {
    return null; // Cannot reliably detect initiative without timestamps
  }

  // A conversation start = first message after 2+ hour gap
  let starts = { ex: 0, other: 0 };
  let ends = { ex: 0, other: 0 };
  const GAP = 2 * 60 * 60 * 1000; // 2 hours in ms

  for (let i = 0; i < messages.length; i++) {
    const curr = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];

    // Conversation start: first message, or first after a 2h+ gap (both must have timestamps)
    const isStart = i === 0 ||
      (curr.timestamp && prev?.timestamp && curr.timestamp - prev.timestamp > GAP);
    if (isStart) {
      if (curr.speaker === exName) starts.ex++;
      else starts.other++;
    }

    // Conversation end: last message, or last before a 2h+ gap
    const isEnd = i === messages.length - 1 ||
      (curr.timestamp && next?.timestamp && next.timestamp - curr.timestamp > GAP);
    if (isEnd) {
      if (curr.speaker === exName) ends.ex++;
      else ends.other++;
    }
  }

  const totalStarts = starts.ex + starts.other;
  const totalEnds = ends.ex + ends.other;
  return {
    initiativeRate: totalStarts > 0 ? starts.ex / totalStarts : 0.5,
    endingRate: totalEnds > 0 ? ends.ex / totalEnds : 0.5,
  };
}

// ---- Score computation ----
function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function computeScores(exMessages, allMessages, exName, responseTimes, initiative) {
  const texts = exMessages.map(m => m.text);
  const allEmoji = texts.flatMap(extractEmoji);
  const emojiRate = texts.length > 0 ? allEmoji.length / texts.length : 0;
  const tone = emotionalTone(texts);

  // Warmth: emoji + affection + positive tone
  const affectionWords = ['宝贝', '亲爱的', '老公', '老婆', '想你', '爱你', '❤', '😘', '🥰', '想念'];
  let affectionCount = 0;
  for (const t of texts) {
    for (const w of affectionWords) { if (t.includes(w)) affectionCount++; }
  }
  const affectionRate = texts.length > 0 ? affectionCount / texts.length : 0;
  const warmth = clamp(
    (emojiRate * 80) + (affectionRate * 150) + (tone * 40) - 10
  );

  // Responsiveness
  let responsiveness = 50;
  if (responseTimes) {
    // Faster = higher score
    const speedScore = Math.max(0, 100 - responseTimes.avg * 3);
    const fastRatio = responseTimes.distribution.fast + responseTimes.distribution.normal;
    responsiveness = clamp(speedScore * 0.6 + fastRatio * 100 * 0.3 + (initiative?.initiativeRate || 0.5) * 20);
  } else if (initiative) {
    responsiveness = clamp(initiative.initiativeRate * 100);
  }

  // Expressiveness: message length + vocabulary + emoji variety
  const avgLen = texts.length > 0 ? texts.reduce((a, t) => a + t.length, 0) / texts.length : 0;
  const uniqueChars = new Set(texts.join('')).size;
  const totalChars = texts.join('').length;
  const richness = totalChars > 0 ? uniqueChars / Math.sqrt(totalChars) : 0;
  const uniqueEmoji = new Set(allEmoji).size;
  const expressiveness = clamp(
    (avgLen * 3) + (richness * 15) + (uniqueEmoji * 5)
  );

  // Engagement: questions + topic variety + conversation continuation
  const questionWords = ['吗', '呢', '什么', '怎么', '为什么', '哪', '？', '?'];
  let questionCount = 0;
  for (const t of texts) {
    for (const q of questionWords) { if (t.includes(q)) { questionCount++; break; } }
  }
  const questionRate = texts.length > 0 ? questionCount / texts.length : 0;
  const topicDist = detectTopics(texts);
  const topicVariety = Object.values(topicDist).filter(v => v > 0.05).length / 5;
  const engagement = clamp(
    (questionRate * 120) + (topicVariety * 40) + ((initiative?.initiativeRate || 0.5) * 40)
  );

  // Compatibility: weighted average with personality label
  const compatibility = clamp(
    warmth * 0.3 + responsiveness * 0.2 + expressiveness * 0.2 + engagement * 0.3
  );

  return { warmth, responsiveness, expressiveness, engagement, compatibility };
}

// ---- Main analyze function ----
export function analyze(messages, exName) {
  const exMessages = messages.filter(m => m.speaker === exName);
  const exTexts = exMessages.filter(m => m.type === 'text').map(m => m.text);

  // Basic stats
  const messageCount = exMessages.length;
  const timestamps = messages.filter(m => m.timestamp).map(m => m.timestamp);
  let timeSpan = null;
  if (timestamps.length >= 2) {
    const start = new Date(Math.min(...timestamps));
    const end = new Date(Math.max(...timestamps));
    timeSpan = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')} ~ ${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  }

  // Vocabulary
  const avgLength = exTexts.length > 0 ? exTexts.reduce((a, t) => a + t.length, 0) / exTexts.length : 0;
  const catchphrases = findCatchphrases(exTexts);
  const particles = countParticles(exTexts);

  // Emoji
  const allEmoji = exTexts.flatMap(extractEmoji);
  const emojiFreq = {};
  for (const e of allEmoji) emojiFreq[e] = (emojiFreq[e] || 0) + 1;
  const topEmoji = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);
  const emojiRate = exTexts.length > 0 ? allEmoji.length / exTexts.length : 0;
  const emojiOnlyRate = exMessages.filter(m => m.type === 'emoji_only').length / (exMessages.length || 1);

  // Response times
  const responseTimes = analyzeResponseTimes(messages, exName);

  // Initiative
  const initiative = analyzeInitiative(messages, exName);

  // Topics
  const topicDist = detectTopics(exTexts);
  const topTopics = Object.entries(topicDist).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
  const tone = emotionalTone(exTexts);

  // Question rate
  const questionWords = ['吗', '呢', '什么', '怎么', '为什么', '哪', '？', '?'];
  let questionCount = 0;
  for (const t of exTexts) {
    for (const q of questionWords) { if (t.includes(q)) { questionCount++; break; } }
  }
  const questionRate = exTexts.length > 0 ? questionCount / exTexts.length : 0;

  // Scores
  const scores = computeScores(exMessages, messages, exName, responseTimes, initiative);

  // Representative messages (for prompt)
  const representatives = selectRepresentatives(exMessages);

  return {
    targetName: exName,
    messageCount,
    timeSpan,
    vocabulary: {
      avgLength: Math.round(avgLength * 10) / 10,
      catchphrases: catchphrases.map(([phrase, count]) => phrase),
      particles,
    },
    emoji: {
      topEmoji,
      emojiRate: Math.round(emojiRate * 100) / 100,
      emojiOnlyRate: Math.round(emojiOnlyRate * 100) / 100,
    },
    response: responseTimes ? {
      avgTime: responseTimes.avg,
      distribution: responseTimes.distribution,
      initiativeRate: initiative.initiativeRate,
      endingRate: initiative.endingRate,
    } : null,
    topics: {
      distribution: topicDist,
      topTopics: topTopics.map(([t]) => t),
      tone,
      questionRate,
    },
    scores,
    representatives,
  };
}

function selectRepresentatives(exMessages) {
  const textMsgs = exMessages.filter(m => m.type === 'text' && m.text.length > 1);
  if (textMsgs.length === 0) return [];

  const avgLen = textMsgs.reduce((a, m) => a + m.text.length, 0) / textMsgs.length;

  const picks = new Map();

  // Closest to average length
  const byAvg = [...textMsgs].sort((a, b) => Math.abs(a.text.length - avgLen) - Math.abs(b.text.length - avgLen));
  if (byAvg[0]) picks.set('avg', byAvg[0].text);

  // Shortest
  const shortest = [...textMsgs].sort((a, b) => a.text.length - b.text.length);
  if (shortest[0]) picks.set('short', shortest[0].text);

  // Longest
  const longest = [...textMsgs].sort((a, b) => b.text.length - a.text.length);
  if (longest[0]) picks.set('long', longest[0].text);

  // Contains emoji
  const withEmoji = textMsgs.find(m => extractEmoji(m.text).length > 0);
  if (withEmoji) picks.set('emoji', withEmoji.text);

  // Contains question
  const withQuestion = textMsgs.find(m => /[？?吗呢]/.test(m.text));
  if (withQuestion) picks.set('question', withQuestion.text);

  return [...new Set(picks.values())].slice(0, 8);
}
