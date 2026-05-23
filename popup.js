const READ_MESSAGE = { type: "INSIGHTSNAP_READ_PAGE" };
const BLOCKED_URL_PATTERN = /^(chrome|edge|about|devtools|chrome-extension):/i;

const state = {
  page: null,
  summary: null
};

const elements = {
  summarizeBtn: document.querySelector("#summarizeBtn"),
  retryBtn: document.querySelector("#retryBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  status: document.querySelector("#status"),
  pageTitle: document.querySelector("#pageTitle"),
  pageUrl: document.querySelector("#pageUrl"),
  takeaway: document.querySelector("#takeaway"),
  bullets: document.querySelector("#bullets"),
  action: document.querySelector("#action"),
  keywords: document.querySelector("#keywords")
};

document.addEventListener("DOMContentLoaded", init);
elements.summarizeBtn.addEventListener("click", summarizeCurrentPage);
elements.retryBtn.addEventListener("click", summarizeCurrentPage);
elements.copyBtn.addEventListener("click", copySummary);

async function init() {
  renderEmptyState();
  await summarizeCurrentPage();
}

async function summarizeCurrentPage() {
  setLoading(true);
  setStatus("正在读取当前网页...");

  try {
    const page = await readCurrentPage();
    state.page = page;
    state.summary = createSummary(page);
    renderPageMeta(page);
    renderSummary(state.summary);
    setStatus(`已分析 ${page.wordCount} 个词，预计阅读 ${page.readingMinutes} 分钟。`);
  } catch (error) {
    state.page = null;
    state.summary = null;
    renderEmptyState();
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

  if (tab.url && BLOCKED_URL_PATTERN.test(tab.url)) {
    throw new Error("浏览器内部页面不允许插件读取。请打开普通网页后再试。");
  }

  const response = await sendReadMessage(tab.id);

  if (!response?.text || response.text.length < 80) {
    throw new Error("当前页面正文较少，暂时无法生成有效摘要。");
  }

  return response;
}

async function sendReadMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, READ_MESSAGE);
  } catch (firstError) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    return chrome.tabs.sendMessage(tabId, READ_MESSAGE);
  }
}

function createSummary(page) {
  const sentences = splitSentences(page.text);
  const keywords = extractKeywords(page.text, page.title);
  const scored = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, page.title, keywords)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map((item) => trimSentence(item.sentence, 108));
  const fallback = page.description || page.title || "该页面围绕一个核心主题展开，适合快速浏览后再深入阅读。";

  return {
    takeaway: trimSentence(selected[0] || fallback, 76),
    bullets: selected.length ? selected : ["页面内容较短，建议阅读原文获取完整上下文。"],
    action: buildAction(keywords, page),
    keywords
  };
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18 && sentence.length <= 260)
    .slice(0, 120);
}

function scoreSentence(sentence, title, keywords) {
  const titleTokens = tokenize(title);
  const sentenceTokens = tokenize(sentence);
  const titleHits = sentenceTokens.filter((token) => titleTokens.includes(token)).length;
  const keywordHits = sentenceTokens.filter((token) => keywords.includes(token)).length;
  const lengthScore = sentence.length > 45 && sentence.length < 160 ? 1.4 : 0.4;
  const signalHits = ["因为", "因此", "总结", "关键", "影响", "建议", "数据", "结果", "发现", "AI", "important", "result"].filter((word) =>
    sentence.toLowerCase().includes(word.toLowerCase())
  ).length;

  return titleHits * 2.2 + keywordHits * 1.4 + lengthScore + signalHits * 1.1;
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
    "there",
    "their",
    "页面",
    "内容",
    "一个",
    "可以",
    "以及",
    "通过",
    "进行",
    "当前",
    "相关",
    "用户",
    "这个"
  ]);
  const counts = new Map();

  tokenize(`${title} ${title} ${text}`).forEach((token) => {
    const normalized = token.toLowerCase();
    if (stopWords.has(normalized) || normalized.length < 2) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}

function tokenize(text = "") {
  const matches = text.match(/[a-zA-Z][a-zA-Z-]{2,}|[\u4e00-\u9fa5]{2,}/g);
  return matches ? matches.map((item) => item.toLowerCase()) : [];
}

function buildAction(keywords, page) {
  const keyword = keywords[0] || "核心观点";
  if (page.wordCount > 1800) {
    return `内容较长，建议先围绕“${keyword}”定位关键段落，再决定是否阅读全文。`;
  }
  return `建议优先关注“${keyword}”相关段落，并结合原文标题判断下一步阅读价值。`;
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

function renderPageMeta(page) {
  elements.pageTitle.textContent = page.title || "当前页面";
  elements.pageUrl.textContent = page.url || "未知地址";
}

function renderEmptyState() {
  elements.pageTitle.textContent = "当前页面";
  elements.pageUrl.textContent = "打开普通网页后即可总结";
  elements.takeaway.textContent = "等待生成总结。";
  elements.action.textContent = "打开一篇文章后点击右上角按钮。";
  elements.bullets.replaceChildren();
  elements.keywords.replaceChildren();
}

async function copySummary() {
  if (!state.summary) {
    setStatus("还没有可复制的总结。");
    return;
  }

  const text = [
    `页面：${state.page?.title || "当前页面"}`,
    `链接：${state.page?.url || ""}`,
    "",
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
  elements.retryBtn.classList.toggle("is-loading", isLoading);
}

function setStatus(message) {
  elements.status.textContent = message;
}
