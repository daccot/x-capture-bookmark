(() => {
  "use strict";

  const APP = "XCaptureBookmark";
  const VERSION = "0.6.0";
  const DEFAULT_SETTINGS = {
    enabled: true,
    debug: false,
    saveButtonPosition: "bottom-right",
    captureScreenshot: false,
    defaultViewMode: "tile",
    language: "auto",
    language: "auto"
  };

  const SELECTORS = {
    post: ['article[data-testid="tweet"]', 'article[role="article"]', "article"],
    permalink: ['a[href*="/status/"]', 'a[href*="/statuses/"]', 'a[href*="/i/web/status/"]', "time a", "a time"]
  };

  let settings = { ...DEFAULT_SETTINGS };
  let initialized = false;
  let listenerRegistered = false;
  let mutationObserver = null;
  const logs = [];

  function log(level, message, data = null) {
    const entry = { time: new Date().toISOString(), level, message, data };
    logs.push(entry);
    while (logs.length > 120) logs.shift();
    if (!settings.debug && level !== "error") return;
    const prefix = `[${APP}][${VERSION}] ${message}`;
    if (level === "error") console.error(prefix, data || "");
    else if (level === "warn") console.warn(prefix, data || "");
    else console.log(prefix, data || "");
  }

  function isXPage() {
    return location.hostname === "x.com" || location.hostname.endsWith(".x.com") ||
      location.hostname === "twitter.com" || location.hostname.endsWith(".twitter.com");
  }

  function queryAllPosts(root = document) {
    const seen = new Set();
    const posts = [];
    for (const selector of SELECTORS.post) {
      try {
        root.querySelectorAll(selector).forEach((node) => {
          if (!seen.has(node)) {
            seen.add(node);
            posts.push(node);
          }
        });
      } catch (error) {
        log("warn", "post selector failed", { selector, error: String(error) });
      }
    }
    return posts;
  }

  function extractPostIdFromUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl, location.origin);
      const match = url.pathname.match(/\/(?:status|statuses)\/(\d+)/) ||
        url.pathname.match(/\/i\/web\/status\/(\d+)/);
      return match ? match[1] : null;
    } catch (_) {
      const match = String(rawUrl).match(/\/(?:status|statuses)\/(\d+)/) ||
        String(rawUrl).match(/\/i\/web\/status\/(\d+)/);
      return match ? match[1] : null;
    }
  }

  function getPermalink(article) {
    if (!article) return "";
    for (const selector of SELECTORS.permalink) {
      try {
        for (const link of article.querySelectorAll(selector)) {
          const href = link.getAttribute("href") || link.href || "";
          if (extractPostIdFromUrl(href)) return new URL(href, location.origin).href;
        }
      } catch (_) {}
    }
    try {
      for (const link of article.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href") || link.href || "";
        if (extractPostIdFromUrl(href)) return new URL(href, location.origin).href;
      }
    } catch (_) {}
    return "";
  }

  function getPostedAt(article) {
    const timeNode = article && article.querySelector("time[datetime]");
    if (!timeNode) return 0;
    const parsed = Date.parse(timeNode.getAttribute("datetime") || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getAuthorInfo(article) {
    const info = { authorName: "", authorHandle: "" };
    if (!article) return info;
    const userNameNode = article.querySelector('[data-testid="User-Name"]');
    const text = userNameNode ? String(userNameNode.innerText || "") : "";
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const handle = lines.find((line) => line.startsWith("@"));
    const name = lines.find((line) => !line.startsWith("@") && !/^\d+[秒分時間日週月年]/.test(line));
    info.authorName = name || "";
    info.authorHandle = handle || "";
    if (!info.authorHandle) {
      const links = Array.from(article.querySelectorAll('a[href^="/"]'));
      const profile = links.find((link) => /^\/[A-Za-z0-9_]{1,20}$/.test(link.getAttribute("href") || ""));
      if (profile) info.authorHandle = `@${profile.getAttribute("href").slice(1)}`;
    }
    return info;
  }

  function getPostText(article) {
    if (!article) return "";
    const tweetText = article.querySelector('[data-testid="tweetText"]');
    const source = tweetText ? tweetText.innerText : article.innerText;
    return String(source || "").replace(/\s+/g, " ").trim().slice(0, 1800);
  }

  function normalizeImgUrl(src) {
    if (!src) return "";
    try {
      const url = new URL(src, location.origin);
      if (url.hostname.endsWith("twimg.com") && url.pathname.includes("/media/")) {
        if (!url.searchParams.has("name")) url.searchParams.set("name", "large");
      }
      return url.href;
    } catch (_) {
      return src;
    }
  }

  function isRealPostMediaUrl(src) {
    if (!src) return false;
    try {
      const url = new URL(src, location.origin);
      if (!url.hostname.endsWith("twimg.com")) return false;

      const path = url.pathname.toLowerCase();
      const href = url.href.toLowerCase();

      // Profile, avatar, emoji, icons, and generated badges must never be treated as post media.
      if (path.includes("/profile_images/")) return false;
      if (path.includes("/emoji/")) return false;
      if (path.includes("/hashflags/")) return false;
      if (path.includes("/sticky/")) return false;
      if (path.includes("/ext_tw_video_thumb/")) return true;
      if (path.includes("/tweet_video_thumb/")) return true;
      if (path.includes("/amplify_video_thumb/")) return true;
      if (path.includes("/media/")) return true;

      if (href.includes("_normal.") || href.includes("_mini.") || href.includes("_bigger.")) return false;
      return false;
    } catch (_) {
      return false;
    }
  }

  function getMediaUrls(article) {
    if (!article) return [];
    const urls = new Set();

    article.querySelectorAll('img[src]').forEach((img) => {
      const src = img.currentSrc || img.getAttribute("src") || "";
      const alt = String(img.getAttribute("alt") || "").toLowerCase();
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;

      if (!isRealPostMediaUrl(src)) return;
      if (alt.includes("profile") || alt.includes("avatar")) return;
      if (w && h && (w < 120 || h < 90)) return;

      urls.add(normalizeImgUrl(src));
    });

    article.querySelectorAll('[style*="background-image"]').forEach((node) => {
      const style = node.getAttribute("style") || "";
      const match = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && isRealPostMediaUrl(match[1])) urls.add(normalizeImgUrl(match[1]));
    });

    return Array.from(urls).slice(0, 8);
  }

  function getVideoUrls(article) {
    if (!article) return [];
    const urls = new Set();
    article.querySelectorAll("video").forEach((video) => {
      const poster = video.getAttribute("poster") || "";
      if (isRealPostMediaUrl(poster)) urls.add(normalizeImgUrl(poster));
    });
    return Array.from(urls).slice(0, 4);
  }

  function getExternalLinks(article) {
    if (!article) return [];
    const links = new Set();
    article.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href) return;
      const url = new URL(href, location.origin);
      const isXStatus = /\/(?:status|statuses)\//.test(url.pathname);
      const isInternal = url.hostname === "x.com" || url.hostname === "twitter.com" || url.hostname.endsWith(".x.com") || url.hostname.endsWith(".twitter.com");
      if (isXStatus) return;
      if (isInternal && !url.pathname.startsWith("/i/redirect")) return;
      links.add(url.href);
    });
    return Array.from(links).slice(0, 8);
  }

  function getQuotedInfo(article) {
    const result = { quotedText: "", quotedAuthor: "" };
    if (!article) return result;

    const allTweetText = Array.from(article.querySelectorAll('[data-testid="tweetText"]'));
    if (allTweetText.length >= 2) {
      const quotedNode = allTweetText[1];
      result.quotedText = String(quotedNode.innerText || "").replace(/\s+/g, " ").trim().slice(0, 600);
      const parent = quotedNode.closest('[role="link"], article, div');
      if (parent) {
        const user = parent.querySelector('[data-testid="User-Name"]');
        if (user) result.quotedAuthor = String(user.innerText || "").split("\n").map(v => v.trim()).filter(Boolean).slice(0, 2).join(" / ");
      }
    }
    return result;
  }

  function getCardCandidate(article) {
    const result = { cardTitle: "", cardDescription: "", cardUrl: "" };
    if (!article) return result;

    const links = getExternalLinks(article);
    result.cardUrl = links[0] || "";

    const linkBlocks = Array.from(article.querySelectorAll('a[href]')).filter((a) => {
      const href = a.getAttribute("href") || "";
      return href && !/\/(?:status|statuses)\//.test(href) && String(a.innerText || "").trim().length > 20;
    });

    const block = linkBlocks[0];
    if (block) {
      const lines = String(block.innerText || "").split("\n").map((v) => v.trim()).filter(Boolean);
      result.cardTitle = lines[0] || "";
      result.cardDescription = lines.slice(1).join(" ").slice(0, 280);
    }
    return result;
  }

  function simpleVisualSnapshot(article, mediaUrls, quoted, card) {
    if (!settings.captureScreenshot || !article) return "";
    const author = getAuthorInfo(article);
    const text = getPostText(article).slice(0, 360);
    const postedAt = getPostedAt(article);
    const firstMedia = mediaUrls && mediaUrls[0] ? mediaUrls[0] : "";
    const imageBlock = firstMedia
      ? `<image href="${escapeXml(firstMedia)}" x="54" y="230" width="360" height="160" preserveAspectRatio="xMidYMid slice"/>`
      : "";
    const quotedBlock = quoted && quoted.quotedText
      ? `<rect x="440" y="230" width="406" height="120" rx="16" fill="#ffffff" stroke="#cbd5e1"/>
         <text x="462" y="260" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(quoted.quotedAuthor || "Quoted post")}</text>
         <foreignObject x="462" y="278" width="360" height="58"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.35;color:#334155;">${escapeHtml(quoted.quotedText.slice(0, 120))}</div></foreignObject>`
      : "";
    const cardBlock = card && card.cardTitle
      ? `<rect x="440" y="355" width="406" height="42" rx="12" fill="#eff6ff"/>
         <text x="462" y="381" font-family="Arial, sans-serif" font-size="16" fill="#1d4ed8">${escapeXml(card.cardTitle.slice(0, 44))}</text>`
      : "";

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="430">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="24" y="24" width="852" height="382" rx="24" fill="#f8fafc" stroke="#dbe3ee"/>
  <text x="54" y="78" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${escapeXml(author.authorName || "X Post")}</text>
  <text x="54" y="112" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${escapeXml(author.authorHandle || "")}</text>
  <foreignObject x="54" y="145" width="792" height="72">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:22px;line-height:1.35;color:#1e293b;white-space:normal;">${escapeHtml(text || "(no text)")}</div>
  </foreignObject>
  ${imageBlock}
  ${quotedBlock}
  ${cardBlock}
  <text x="54" y="398" font-family="Arial, sans-serif" font-size="16" fill="#64748b">${escapeXml(postedAt ? new Date(postedAt).toLocaleString() : "")}</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function buildPostPayload(article) {
    const url = getPermalink(article);
    const id = extractPostIdFromUrl(url);
    if (!id || !url) return null;

    const author = getAuthorInfo(article);
    const mediaUrls = getMediaUrls(article);
    const videoUrls = getVideoUrls(article);
    const externalLinks = getExternalLinks(article);
    const quoted = getQuotedInfo(article);
    const card = getCardCandidate(article);

    return {
      id,
      url,
      authorName: author.authorName,
      authorHandle: author.authorHandle,
      text: getPostText(article),
      postedAt: getPostedAt(article),
      savedAt: Date.now(),
      folder: "未分類",
      memo: "",
      mediaUrls,
      videoUrls,
      externalLinks,
      quotedText: quoted.quotedText,
      quotedAuthor: quoted.quotedAuthor,
      cardTitle: card.cardTitle,
      cardDescription: card.cardDescription,
      cardUrl: card.cardUrl || externalLinks[0] || "",
      screenshotDataUrl: simpleVisualSnapshot(article, mediaUrls.concat(videoUrls), quoted, card)
    };
  }

  function markSaved(article) {
    if (!article) return;
    article.classList.add("xcb-post-saved");
    setTimeout(() => article.classList.remove("xcb-post-saved"), 1800);
  }

  function showToast(message) {
    const existing = document.querySelector(".xcb-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "xcb-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function applySaveButtonPosition(host) {
    host.classList.remove("pos-bottom-right", "pos-bottom-left", "pos-top-right", "pos-top-left");
    host.classList.add(`pos-${settings.saveButtonPosition || "bottom-right"}`);
  }

  async function saveArticle(article) {
    const payload = buildPostPayload(article);
    if (!payload) {
      showToast("保存できませんでした：投稿リンクを取得できません");
      log("warn", "save failed: no permalink", { text: String(article && article.innerText || "").slice(0, 160) });
      return null;
    }
    const saved = await window.XCaptureDB.savePost(payload);
    article.dataset.xcbSaved = "1";
    const button = article.querySelector(".xcb-save-button");
    if (button) {
      button.textContent = "保存済み";
      button.classList.add("is-saved");
    }
    markSaved(article);
    showToast("保存しました");
    log("info", "post saved", saved);
    return saved;
  }

  function injectSaveButton(article) {
    if (!settings.enabled || !article || article.dataset.xcbInjected === "1") return;
    const payload = buildPostPayload(article);
    if (!payload) return;

    article.dataset.xcbInjected = "1";
    article.dataset.xcbPostId = payload.id;

    const host = document.createElement("div");
    host.className = "xcb-save-host";
    applySaveButtonPosition(host);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xcb-save-button";
    button.textContent = "📌 保存";
    button.title = "このポストをローカル保存";
    button.setAttribute("aria-label", "このポストを保存");

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try { await saveArticle(article); }
      catch (error) {
        showToast("保存エラー");
        log("error", "saveArticle failed", String(error && error.message ? error.message : error));
      } finally {
        button.disabled = false;
      }
    });

    host.appendChild(button);
    article.appendChild(host);
  }

  function updateInjectedButtonPositions() {
    document.querySelectorAll(".xcb-save-host").forEach(applySaveButtonPosition);
  }

  function scanAndInject(root = document) {
    queryAllPosts(root).forEach(injectSaveButton);
  }

  function startMutationObserver() {
    const root = document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('main[role="main"]') ||
      document.body;

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scanAndInject(node);
        });
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
  }

  function buildDiagnostics(extra = {}) {
    return {
      app: APP,
      version: VERSION,
      url: location.href,
      settings,
      initialized,
      listenerRegistered,
      dbLoaded: Boolean(window.XCaptureDB),
      articleCount: queryAllPosts(document).length,
      injectedCount: document.querySelectorAll("[data-xcb-injected='1']").length,
      samplePostIds: queryAllPosts(document).slice(0, 10).map((article) => article.dataset.xcbPostId || extractPostIdFromUrl(getPermalink(article))).filter(Boolean),
      recentLogs: logs.slice(-80),
      ...extra
    };
  }

  function setupMessageListener() {
    if (listenerRegistered) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.scope !== APP) return false;
      (async () => {
        try {
          if (message.type === "GET_STATUS") {
            const posts = await window.XCaptureDB.getAllPosts();
            sendResponse({ ok: true, posts, settings, diagnostics: buildDiagnostics() });
            return;
          }
          if (message.type === "DELETE_POST") {
            await window.XCaptureDB.deletePost(message.id);
            const posts = await window.XCaptureDB.getAllPosts();
            sendResponse({ ok: true, posts, diagnostics: buildDiagnostics() });
            return;
          }
          if (message.type === "CLEAR_ALL") {
            await window.XCaptureDB.clearAllPosts();
            const posts = await window.XCaptureDB.getAllPosts();
            sendResponse({ ok: true, posts, diagnostics: buildDiagnostics() });
            return;
          }
          if (message.type === "SET_SETTINGS") {
            settings = { ...settings, ...(message.settings || {}) };
            await chrome.storage.local.set(settings);
            updateInjectedButtonPositions();
            if (settings.enabled) scanAndInject(document);
            sendResponse({ ok: true, settings, diagnostics: buildDiagnostics() });
            return;
          }
          if (message.type === "UPDATE_POST") {
            const updated = await window.XCaptureDB.updatePost(message.id, message.patch || {});
            const posts = await window.XCaptureDB.getAllPosts();
            sendResponse({ ok: true, updated, posts, diagnostics: buildDiagnostics() });
            return;
          }
          sendResponse({ ok: false, error: "Unknown message type", diagnostics: buildDiagnostics() });
        } catch (error) {
          const errorText = String(error && error.message ? error.message : error);
          log("error", "message handling failed", errorText);
          sendResponse({ ok: false, error: errorText, diagnostics: buildDiagnostics() });
        }
      })();
      return true;
    });
    listenerRegistered = true;
  }

  async function getSettings() {
    return new Promise((resolve) => chrome.storage.local.get(DEFAULT_SETTINGS, (value) => resolve({ ...DEFAULT_SETTINGS, ...value })));
  }

  async function init() {
    setupMessageListener();
    if (initialized) return;
    initialized = true;
    if (!isXPage()) {
      log("warn", "not an X page");
      return;
    }
    settings = await getSettings();
    if (!settings.enabled) {
      log("info", "disabled by setting");
      return;
    }
    scanAndInject(document);
    startMutationObserver();
    setTimeout(() => scanAndInject(document), 1000);
    setTimeout(() => scanAndInject(document), 3000);
    log("info", "initialized", buildDiagnostics());
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (Object.keys(changes).some((key) => key in DEFAULT_SETTINGS)) {
      chrome.storage.local.get(DEFAULT_SETTINGS, (value) => {
        settings = { ...DEFAULT_SETTINGS, ...value };
        updateInjectedButtonPositions();
        if (settings.enabled) scanAndInject(document);
      });
    }
  });

  window.XCaptureBookmarkDiagnostics = buildDiagnostics;
  init().catch((error) => log("error", "init failed", String(error && error.message ? error.message : error)));
})();
