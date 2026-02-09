
export async function analyzeImageBlob(blob, { k = 6, mode = 'Studio' } = {}) {
  const form = new FormData()
  form.append('file', blob, 'reference.png')

  const url = `http://127.0.0.1:8000/analyze?k=${encodeURIComponent(k)}&mode=${encodeURIComponent(mode)}`
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Backend error (${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

export async function healthCheck() {
  const res = await fetch('http://127.0.0.1:8000/health')
  return res.ok
}

export function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob())
}

