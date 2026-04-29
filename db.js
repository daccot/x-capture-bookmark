(() => {
  "use strict";

  const DB_NAME = "x_capture_bookmark";
  const DB_VERSION = 1;
  const STORE_NAME = "posts";
  const SCHEMA_VERSION = 5;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("savedAt", "savedAt", { unique: false });
          store.createIndex("postedAt", "postedAt", { unique: false });
          store.createIndex("authorHandle", "authorHandle", { unique: false });
          store.createIndex("folder", "folder", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("IndexedDB transaction failed")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("IndexedDB transaction aborted")); };
      try { result = callback(store); } catch (error) { tx.abort(); reject(error); }
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function arr(value) {
    return Array.isArray(value) ? value.filter(Boolean).slice(0, 12) : [];
  }

  function normalizePost(post) {
    const now = Date.now();
    const id = String(post.id || "").trim();
    if (!id) throw new Error("Post id is required.");
    if (!post.url) throw new Error("Post URL is required.");

    return {
      id,
      url: String(post.url),
      authorName: String(post.authorName || ""),
      authorHandle: String(post.authorHandle || ""),
      text: String(post.text || "").replace(/\s+/g, " ").trim(),
      postedAt: Number(post.postedAt || 0),
      savedAt: Number(post.savedAt || now),
      updatedAt: now,
      folder: String(post.folder || "未分類"),
      memo: String(post.memo || ""),
      screenshotDataUrl: String(post.screenshotDataUrl || ""),
      mediaUrls: arr(post.mediaUrls),
      videoUrls: arr(post.videoUrls),
      externalLinks: arr(post.externalLinks),
      quotedText: String(post.quotedText || "").replace(/\s+/g, " ").trim(),
      quotedAuthor: String(post.quotedAuthor || ""),
      cardTitle: String(post.cardTitle || ""),
      cardDescription: String(post.cardDescription || ""),
      cardUrl: String(post.cardUrl || ""),
      source: "x",
      schemaVersion: SCHEMA_VERSION
    };
  }

  async function savePost(post) {
    const normalized = normalizePost(post);
    const existing = await getPost(normalized.id);
    const merged = existing
      ? {
          ...existing,
          ...normalized,
          savedAt: existing.savedAt || normalized.savedAt,
          updatedAt: Date.now(),
          folder: existing.folder || normalized.folder,
          memo: existing.memo || normalized.memo,
          screenshotDataUrl: normalized.screenshotDataUrl || existing.screenshotDataUrl || "",
          mediaUrls: normalized.mediaUrls.length ? normalized.mediaUrls : (existing.mediaUrls || []),
          videoUrls: normalized.videoUrls.length ? normalized.videoUrls : (existing.videoUrls || []),
          externalLinks: normalized.externalLinks.length ? normalized.externalLinks : (existing.externalLinks || [])
        }
      : normalized;
    await withStore("readwrite", (store) => store.put(merged));
    return merged;
  }

  async function getPost(id) {
    if (!id) return null;
    const record = await withStore("readonly", (store) => requestToPromise(store.get(String(id))));
    return record || null;
  }

  async function getAllPosts() {
    const records = await withStore("readonly", (store) => requestToPromise(store.getAll()));
    return (records || []).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
  }

  async function deletePost(id) {
    if (!id) return false;
    await withStore("readwrite", (store) => store.delete(String(id)));
    return true;
  }

  async function clearAllPosts() {
    await withStore("readwrite", (store) => store.clear());
    return true;
  }

  async function updatePost(id, patch) {
    const current = await getPost(id);
    if (!current) throw new Error("Post not found.");
    const next = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: Date.now(),
      folder: String(patch.folder || current.folder || "未分類"),
      memo: String(patch.memo ?? current.memo ?? "")
    };
    await withStore("readwrite", (store) => store.put(next));
    return next;
  }

  window.XCaptureDB = {
    DB_NAME, STORE_NAME, SCHEMA_VERSION,
    savePost, getPost, getAllPosts, deletePost, clearAllPosts, updatePost
  };
})();
