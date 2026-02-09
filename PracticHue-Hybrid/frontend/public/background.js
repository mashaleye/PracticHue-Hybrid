// background.js (MV3 service worker)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Health ping to prove the worker is alive
  if (msg?.type === 'PING') {
    sendResponse({ ok: true, from: 'background' })
    return
  }

  if (msg?.type !== 'CAPTURE_VISIBLE_TAB' && msg?.type !== 'CAPTURE_SELF_TAB') {
    return
  }

  const windowId =
    Number.isInteger(msg?.windowId) ? msg.windowId :
    Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId :
    null

  if (!Number.isInteger(windowId)) {
    sendResponse({ ok: false, error: 'No valid windowId to capture' })
    return
  }

  chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message })
      return
    }
    sendResponse({ ok: true, dataUrl })
  })

  return true // keep channel open for async sendResponse
})
