// MV3 Service Worker (background)
// Handles capture requests from the popup.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const isCapture =
    msg?.type === "CAPTURE_VISIBLE_TAB" ||
    msg?.type === "CAPTURE_TAB";

  if (!isCapture) return;

  // sender.tab can be undefined when called from popup
  const winId = sender?.tab?.windowId;

  const capture = (windowId) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
  };

  if (typeof winId === "number") {
    capture(winId);
  } else {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const w = tabs?.[0]?.windowId;
      capture(w);
    });
  }

  return true; // keep sendResponse alive
});
