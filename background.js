(() => {
  "use strict";
  const DEFAULT_SETTINGS = {
    enabled: true,
    debug: false,
    saveButtonPosition: "bottom-right",
    captureScreenshot: false,
    defaultViewMode: "tile",
    language: "auto",
    language: "auto"
  };
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("[XCaptureBookmark][BG] installed", details);
    const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
    await chrome.storage.local.set({
      enabled: typeof current.enabled === "boolean" ? current.enabled : DEFAULT_SETTINGS.enabled,
      debug: typeof current.debug === "boolean" ? current.debug : DEFAULT_SETTINGS.debug,
      saveButtonPosition: typeof current.saveButtonPosition === "string" ? current.saveButtonPosition : DEFAULT_SETTINGS.saveButtonPosition,
      captureScreenshot: typeof current.captureScreenshot === "boolean" ? current.captureScreenshot : DEFAULT_SETTINGS.captureScreenshot,
      defaultViewMode: typeof current.defaultViewMode === "string" ? current.defaultViewMode : DEFAULT_SETTINGS.defaultViewMode,
      language: typeof current.language === "string" ? current.language : DEFAULT_SETTINGS.language
    });
  });
})();
