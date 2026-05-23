const state = {
  page: null,
  summary: null
};

const elements = {
  summarizeBtn: document.querySelector("#summarizeBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  status: document.querySelector("#status"),
  takeaway: document.querySelector("#takeaway"),
  bullets: document.querySelector("#bullets"),
  action: document.querySelector("#action"),
  keywords: document.querySelector("#keywords")
};

document.addEventListener("DOMContentLoaded", init);
elements.summarizeBtn.addEventListener("click", summarizeCurrentPage);
elements.copyBtn.addEventListener("click", copySummary);

async function init() {
  await summarizeCurrentPage();
}

async function summarizeCurrentPage() {
  setLoading(true);
  setStatus("正在读取当前网页...");

  try {
    const page = await readCurrentPage();
    state.page = page;
    state.summary = createSummary(page);
    renderSummary(state.summary);
    setStatus(`已分析 ${page.wordCount} 个词，预计阅读 ${page.readingMinutes} 分钟。`);
  } catch (error) {
    setStatus(error.message || "无法读取当前网页，请刷新页面后重试。");
  } finally {
    setLoading(false);
  }
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("未找到当前标签页。");
  }

  const response = await chrome.tabs.sendMessage(tab.id, { type: "INSIGHTSNAP_READ_PAGE" });

  if (!response?.text) {
    throw new Error("当前页面正文较少，暂时无法生成有效摘要。");
  }

  return response;
}

function createSummary(page) {
  const sentences = splitSentences(page.text);
  const scored = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, page.title)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored.slice(0, 3).sort((a, b) => a.index - b.index).map((item) => item.sentence);
  const keywords = extractKeywords(page.text, page.title);
  const takeaway = selected[0] || page.description || page.title || "该页面围绕一个核心主题展开，适合快速浏览后再深入阅读。";

  return {
    takeaway: trimSentence(takeaway, 72),
    bullets: selected.length ? selected.map((item) => trimSentence(item, 96)) : ["页面内容较短，建议阅读原文获取完整上下文。"],
    action: `建议优先关注“${keywords[0] || "核心观点"}”相关段落，再判断是否需要阅读全文。`,
    keywords
  };
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18)
    .slice(0, 80);
}

function scoreSentence(sentence, title) {
  const titleTokens = tokenize(title);
  const sentenceTokens = tokenize(sentence);
  const titleHits = sentenceTokens.filter((token) => titleTokens.includes(token)).length;
  const lengthScore = Math.min(sentence.length / 90, 1);
  const signalHits = ["因为", "因此", "总结", "关键", "影响", "建议", "数据", "结果", "发现", "AI"].filter((word) =>
    sentence.includes(word)
  ).length;

  return titleHits * 2.4 + lengthScore + signalHits * 1.2;
}

function extractKeywords(text, title) {
  const stopWords = new Set([
    "this",
    "that",
    "with",
    "from",
    "have",
    "will",
    "your",
    "about",
    "页面",
    "内容",
    "一个",
    "可以",
    "以及",
    "通过",
    "进行",
    "当前"
  ]);
  const counts = new Map();

  tokenize(`${title} ${text}`).forEach((token) => {
    if (stopWords.has(token.toLowerCase()) || token.length < 2) return;
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function tokenize(text = "") {
  const matches = text.match(/[a-zA-Z][a-zA-Z-]{2,}|[\u4e00-\u9fa5]{2,}/g);
  return matches ? matches.map((item) => item.toLowerCase()) : [];
}

function trimSentence(sentence, maxLength) {
  if (sentence.length <= maxLength) return sentence;
  return `${sentence.slice(0, maxLength - 1)}…`;
}

function renderSummary(summary) {
  elements.takeaway.textContent = summary.takeaway;
  elements.action.textContent = summary.action;

  elements.bullets.replaceChildren(
    ...summary.bullets.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    })
  );

  elements.keywords.replaceChildren(
    ...summary.keywords.map((word) => {
      const span = document.createElement("span");
      span.className = "keyword";
      span.textContent = word;
      return span;
    })
  );
}

async function copySummary() {
  if (!state.summary) return;

  const text = [
    `一句话结论：${state.summary.takeaway}`,
    "",
    "重点摘要：",
    ...state.summary.bullets.map((item) => `- ${item}`),
    "",
    `行动建议：${state.summary.action}`,
    `关键词：${state.summary.keywords.join("、")}`
  ].join("\n");

  await navigator.clipboard.writeText(text);
  setStatus("总结已复制到剪贴板。");
}

function setLoading(isLoading) {
  elements.summarizeBtn.classList.toggle("is-loading", isLoading);
}

function setStatus(message) {
  elements.status.textContent = message;
}
