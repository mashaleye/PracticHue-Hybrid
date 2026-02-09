chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message })
      } else {
        sendResponse({ ok: true, dataUrl })
      }
    })
    return true
  }
})
