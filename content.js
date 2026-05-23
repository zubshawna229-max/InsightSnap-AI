chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "INSIGHTSNAP_READ_PAGE") return false;

  const page = extractPage();
  sendResponse(page);
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
  const main = document.querySelector("article, main, [role='main']") || document.body;
  const blocks = [...main.querySelectorAll("h1, h2, h3, p, li, blockquote")]
    .map((node) => cleanText(node.innerText))
    .filter((text) => text.length > 24);

  return [...new Set(blocks)].join("\n");
}

function countWords(text) {
  const englishWords = text.match(/[a-zA-Z][a-zA-Z-]*/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  return englishWords.length + Math.ceil(chineseChars.length / 2);
}

function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}
