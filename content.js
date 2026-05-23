chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "INSIGHTSNAP_READ_PAGE") return false;

  sendResponse(extractPage());
  return true;
});

function extractPage() {
  const title = document.title || document.querySelector("h1")?.innerText || "Untitled page";
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";
  const text = collectReadableText();
  const wordCount = countWords(text);

  return {
    title: cleanText(title),
    description: cleanText(description),
    url: location.href,
    text,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 320))
  };
}

function collectReadableText() {
  const root = pickReadableRoot();
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, nav, footer, header, aside, form, noscript, svg, canvas, iframe").forEach((node) => {
    node.remove();
  });

  const blocks = [...clone.querySelectorAll("h1, h2, h3, p, li, blockquote")]
    .map((node) => cleanText(node.innerText || node.textContent))
    .filter(isUsefulText);

  const uniqueBlocks = [];
  const seen = new Set();

  blocks.forEach((text) => {
    const key = text.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    uniqueBlocks.push(text);
  });

  return uniqueBlocks.join("\n");
}

function pickReadableRoot() {
  const candidates = [...document.querySelectorAll("article, main, [role='main'], .post, .article, .content")];
  const best = candidates
    .map((node) => ({
      node,
      score: cleanText(node.innerText || node.textContent).length
    }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.score > 200 ? best.node : document.body;
}

function isUsefulText(text) {
  if (text.length < 28 || text.length > 900) return false;
  if (/^(cookie|privacy|subscribe|sign in|log in)$/i.test(text)) return false;
  return true;
}

function countWords(text) {
  const englishWords = text.match(/[a-zA-Z][a-zA-Z-]*/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  return englishWords.length + Math.ceil(chineseChars.length / 2);
}

function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}
