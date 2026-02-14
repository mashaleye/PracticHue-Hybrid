import { useEffect, useMemo, useRef, useState } from 'react'
import PaletteCards from './components/PaletteCards.jsx'
import { analyzeImageBlob, dataUrlToBlob, healthCheck } from './api.js'

const DEFAULT_STYLE = 'Studio'

/* =========================
   Theme persistence helpers
   ========================= */
const THEME_KEY = 'practichue_theme'
const SESSION_KEY = 'practichue_session_v1'

function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

async function readTheme() {
  try {
    if (chrome?.storage?.local) {
      const res = await chrome.storage.local.get([THEME_KEY])
      return res?.[THEME_KEY] || null
    }
  } catch {}
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

async function writeTheme(value) {
  try {
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ [THEME_KEY]: value })
      return
    }
  } catch {}
  try {
    localStorage.setItem(THEME_KEY, value)
  } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function storageGet(key) {
  try {
    if (chrome?.storage?.local) return await chrome.storage.local.get([key])
  } catch {}
  try {
    return { [key]: JSON.parse(localStorage.getItem(key) || 'null') }
  } catch {
    return { [key]: null }
  }
}

async function storageSet(obj) {
  try {
    if (chrome?.storage?.local) { await chrome.storage.local.set(obj); return }
  } catch {}
  try {
    for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v))
  } catch {}
}

/* =========================
   Color helpers
   ========================= */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

function hexToRgbObj(hex) {
  const cleaned = String(hex || '').replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return { r, g, b }
}

function rgbToHex(r, g, b) {
  const rr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0')
  const gg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0')
  const bb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0')
  return `#${rr}${gg}${bb}`.toUpperCase()
}

function rgbToHslObj(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
      default: break
    }
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToRgbObj(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = clamp(s, 0, 100) / 100
  l = clamp(l, 0, 100) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r1 = 0, g1 = 0, b1 = 0
  if (0 <= h && h < 60) [r1, g1, b1] = [c, x, 0]
  else if (60 <= h && h < 120) [r1, g1, b1] = [x, c, 0]
  else if (120 <= h && h < 180) [r1, g1, b1] = [0, c, x]
  else if (180 <= h && h < 240) [r1, g1, b1] = [0, x, c]
  else if (240 <= h && h < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

// HSV is easiest for SV square + Hue slider
function rgbToHsvObj(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const v = max
  const s = max === 0 ? 0 : d / max

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      case b: h = ((r - g) / d + 4); break
      default: break
    }
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) }
}

function hsvToRgbObj(h, s, v) {
  h = ((h % 360) + 360) % 360
  s = clamp(s, 0, 100) / 100
  v = clamp(v, 0, 100) / 100

  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r1 = 0, g1 = 0, b1 = 0
  if (0 <= h && h < 60) [r1, g1, b1] = [c, x, 0]
  else if (60 <= h && h < 120) [r1, g1, b1] = [x, c, 0]
  else if (120 <= h && h < 180) [r1, g1, b1] = [0, c, x]
  else if (180 <= h && h < 240) [r1, g1, b1] = [0, x, c]
  else if (240 <= h && h < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

function luminance({ r, g, b }) {
  const a = [r, g, b].map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}

/* PNG swatch generator */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function swatchPngBlob({ hex, rgbText, hslText, contrastText, sourceText, size = 768 }) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = hex
      ctx.fillRect(0, 0, size, size)

      const gloss = ctx.createLinearGradient(0, 0, 0, size)
      gloss.addColorStop(0, 'rgba(255,255,255,.18)')
      gloss.addColorStop(0.35, 'rgba(255,255,255,.05)')
      gloss.addColorStop(1, 'rgba(0,0,0,.18)')
      ctx.fillStyle = gloss
      ctx.fillRect(0, 0, size, size)

      const rgb = hexToRgbObj(hex)
      const lum = rgb ? luminance(rgb) : 0.5
      const fg = lum > 0.45 ? 'rgba(0,0,0,.84)' : 'rgba(255,255,255,.92)'
      const fgSoft = lum > 0.45 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.65)'

      const pad = Math.round(size * 0.06)
      const panelH = Math.round(size * 0.28)
      const r = Math.round(size * 0.04)

      ctx.save()
      ctx.globalAlpha = 0.86
      ctx.fillStyle = lum > 0.45 ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.48)'
      roundRect(ctx, pad, size - pad - panelH, size - pad * 2, panelH, r)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = fg
      ctx.font = `800 ${Math.round(size * 0.06)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`
      ctx.fillText(hex, pad + Math.round(size * 0.04), size - pad - panelH + Math.round(size * 0.11))

      ctx.fillStyle = fgSoft
      ctx.font = `700 ${Math.round(size * 0.032)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`
      ctx.fillText(`RGB ${rgbText}`, pad + Math.round(size * 0.04), size - pad - panelH + Math.round(size * 0.18))
      ctx.fillText(`HSL ${hslText}`, pad + Math.round(size * 0.04), size - pad - panelH + Math.round(size * 0.24))

      ctx.font = `700 ${Math.round(size * 0.028)}px ui-sans-serif, system-ui`
      ctx.fillText(contrastText, pad + Math.round(size * 0.52), size - pad - panelH + Math.round(size * 0.18))
      ctx.fillText(sourceText, pad + Math.round(size * 0.52), size - pad - panelH + Math.round(size * 0.24))

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to create PNG blob'))
        resolve(blob)
      }, 'image/png')
    } catch (e) {
      reject(e)
    }
  })
}

export default function App() {
  const [step, setStep] = useState(1)
  const [refPreview, setRefPreview] = useState(null)
  const [cards, setCards] = useState([])
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [k, setK] = useState(6)
  const [mode, setMode] = useState(DEFAULT_STYLE)
  const [backendOk, setBackendOk] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  // picker
  const [pickerOpen, setPickerOpen] = useState(false)

  // HSV is source of truth for picker UI
  const [pickerHsv, setPickerHsv] = useState({ h: 190, s: 40, v: 50 })
  const [pickedFromImage, setPickedFromImage] = useState(null) // { hex, rgb, hsl, hsv, luminance }

  // swatch labels display format
  const [displayFormat, setDisplayFormat] = useState('hex') // 'hex'|'rgb'|'hsl'

  // theme
  const [theme, setTheme] = useState('dark')
  const fileInputRef = useRef(null)

  const svRef = useRef(null)
  const draggingRef = useRef(false)

  const isExpanded = useMemo(() => {
    try {
      const url = new URL(window.location.href)
      return url.searchParams.get('view') === 'expanded'
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    document.body.dataset.view = isExpanded ? 'expanded' : ''
    return () => { document.body.dataset.view = '' }
  }, [isExpanded])

  useEffect(() => {
    ;(async () => {
      const saved = await readTheme()
      const initial = saved || getSystemTheme()
      setTheme(initial)
    })()
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
    writeTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    healthCheck()
      .then(ok => setBackendOk(ok))
      .catch(() => setBackendOk(false))
  }, [])

  // hydrate session (shared between popup + expanded via sid)
  useEffect(() => {
    ;(async () => {
      const res = await storageGet(SESSION_KEY)
      const saved = res?.[SESSION_KEY]

      let sid = null
      try {
        const url = new URL(window.location.href)
        sid = url.searchParams.get('sid')
      } catch {}

      const nextSid = sid || saved?.sessionId || uid()
      setSessionId(nextSid)

      if (saved && (!saved.sessionId || saved.sessionId === nextSid)) {
        setStep(saved.step ?? 1)
        setRefPreview(saved.refPreview ?? null)
        setCards(saved.cards ?? [])
        setInsight(saved.insight ?? null)
        setK(saved.k ?? 6)
        setMode(saved.mode ?? DEFAULT_STYLE)
        setTheme(saved.theme ?? 'dark')
        setDisplayFormat(saved.displayFormat ?? 'hex')
        setPickerHsv(saved.pickerHsv ?? { h: 190, s: 40, v: 50 })
        setPickedFromImage(saved.pickedFromImage ?? null)
      }

      setHydrated(true)
    })()
  }, [])

  // persist session
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => {
      storageSet({
        [SESSION_KEY]: {
          sessionId,
          step,
          refPreview,
          cards,
          insight,
          k,
          mode,
          theme,
          displayFormat,
          pickerHsv,
          pickedFromImage,
          updatedAt: new Date().toISOString(),
        }
      })
    }, 250)
    return () => clearTimeout(t)
  }, [hydrated, sessionId, step, refPreview, cards, insight, k, mode, theme, displayFormat, pickerHsv, pickedFromImage])

  // expanded scrim marker
  useEffect(() => {
    if (!isExpanded) return
    document.body.dataset.picker = pickerOpen ? 'open' : ''
    return () => { document.body.dataset.picker = '' }
  }, [pickerOpen, isExpanded])

  const statusPill = useMemo(() => {
    if (backendOk === null) return { text: 'Checking backend…', tone: 'muted' }
    if (backendOk) return { text: 'Backend: Online', tone: 'ok' }
    return { text: 'Backend: Offline', tone: 'bad' }
  }, [backendOk])

  async function analyze(blob) {
    try {
      const res = await analyzeImageBlob(blob, { k, mode })
      setCards(res.harmony_cards || [])
      setInsight(res.insight || null)
      setStep(2)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function captureVisibleTab() {
    setError('')
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' })
      if (!response?.ok) throw new Error(response?.error || 'Capture failed')

      const dataUrl = response.dataUrl
      setRefPreview(dataUrl)
      const blob = await dataUrlToBlob(dataUrl)
      await analyze(blob)
    } catch (e) {
      setError(e?.message || String(e))
      setLoading(false)
    }
  }

  async function captureSelfTab() {
    setError('')
    setLoading(true)
    try {
      const tab = await new Promise((resolve) => chrome.tabs.getCurrent(resolve))
      const windowId = tab?.windowId
      if (!Number.isInteger(windowId)) throw new Error('Unable to detect current window')

      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SELF_TAB',
        windowId
      })
      if (!response?.ok) throw new Error(response?.error || 'Capture failed')

      const dataUrl = response.dataUrl
      setRefPreview(dataUrl)

      const blob = await dataUrlToBlob(dataUrl)
      await analyze(blob)
    } catch (e) {
      setError(e?.message || String(e))
      setLoading(false)
    }
  }

  function onUploadFile(file) {
    setError('')
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        setRefPreview(reader.result)
        await analyze(file)
      } catch (e) {
        setError(e?.message || String(e))
        setLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) onUploadFile(file)
  }

  // swatch label formatting (drives PaletteCards)
  function formatColor(hex) {
    if (!hex) return ''
    const clean = String(hex).trim().toUpperCase()
    if (displayFormat === 'hex') return clean

    const rgb = hexToRgbObj(clean)
    if (!rgb) return clean

    if (displayFormat === 'rgb') {
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    }

    const hsl = rgbToHslObj(rgb.r, rgb.g, rgb.b)
    return `hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)`
  }

  // clicking swatches copies what’s displayed
  function onCopy(text) {
    navigator.clipboard?.writeText(String(text)).catch(() => {})
  }

  function allColorsFlat() {
    const set = new Set()
    for (const c of cards) for (const hex of (c.colors || [])) set.add(String(hex).toUpperCase())
    return [...set]
  }

  function copyAll() {
    const colors = allColorsFlat()
    if (!colors.length) return
    navigator.clipboard?.writeText(colors.join(', ')).catch(() => {})
  }

  function downloadJSON() {
    const payload = {
      generated_at: new Date().toISOString(),
      mode,
      k,
      cards,
      insight
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `practichue_${mode.toLowerCase()}_${k}colors.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function reset() {
    setStep(1)
    setCards([])
    setInsight(null)
    setRefPreview(null)
    setError('')
    setLoading(false)
    setPickedFromImage(null)
    // keep sessionId but clear content
    if (hydrated) {
      await storageSet({
        [SESSION_KEY]: {
          sessionId,
          step: 1,
          refPreview: null,
          cards: [],
          insight: null,
          k,
          mode,
          theme,
          displayFormat,
          pickerHsv,
          pickedFromImage: null,
          updatedAt: new Date().toISOString(),
        }
      })
    }
  }

  function openExpanded() {
    const sid = sessionId || uid()
    const url = chrome.runtime.getURL(`index.html?view=expanded&sid=${encodeURIComponent(sid)}`)
    chrome.tabs.create({ url })
  }

  function closeExpanded() {
    try { window.close() } catch {}
  }

  /* =========================
     Picker: derived values
     ========================= */
  const pickerRgb = useMemo(() => hsvToRgbObj(pickerHsv.h, pickerHsv.s, pickerHsv.v), [pickerHsv])
  const pickerHex = useMemo(() => rgbToHex(pickerRgb.r, pickerRgb.g, pickerRgb.b), [pickerRgb])
  const pickerHsl = useMemo(() => rgbToHslObj(pickerRgb.r, pickerRgb.g, pickerRgb.b), [pickerRgb])
  const pickerLum = useMemo(() => luminance(pickerRgb), [pickerRgb])

  const contrastText = pickerLum > 0.45 ? 'Better on light backgrounds' : 'Better on dark backgrounds'
  const sourceText = pickedFromImage ? 'Sampled from reference' : 'Manual picker'

  // When you click the reference image while picker open, sample pixel -> set HSV
  function pickFromImage(e) {
    const img = e.target
    const rect = img.getBoundingClientRect()

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')

    ctx.drawImage(img, 0, 0)

    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height

    const pixel = ctx.getImageData(
      Math.floor(x * scaleX),
      Math.floor(y * scaleY),
      1, 1
    ).data

    const rgb = { r: pixel[0], g: pixel[1], b: pixel[2] }
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    const hsv = rgbToHsvObj(rgb.r, rgb.g, rgb.b)
    const hsl = rgbToHslObj(rgb.r, rgb.g, rgb.b)
    const lum = luminance(rgb)

    setPickerHsv(hsv)
    setPickedFromImage({ hex, rgb, hsv, hsl, luminance: lum })
  }

  // SV square interaction
  function svFromPointer(clientX, clientY) {
    const el = svRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = clamp(clientX - r.left, 0, r.width)
    const y = clamp(clientY - r.top, 0, r.height)

    const s = Math.round((x / r.width) * 100)
    const v = Math.round((1 - y / r.height) * 100)
    return { s, v }
  }

  function onSvDown(e) {
    draggingRef.current = true
    const next = svFromPointer(e.clientX, e.clientY)
    if (next) setPickerHsv(p => ({ ...p, ...next }))
  }

  function onSvMove(e) {
    if (!draggingRef.current) return
    const next = svFromPointer(e.clientX, e.clientY)
    if (next) setPickerHsv(p => ({ ...p, ...next }))
  }

  function onSvUp() {
    draggingRef.current = false
  }

  useEffect(() => {
    window.addEventListener('pointerup', onSvUp)
    window.addEventListener('pointermove', onSvMove)
    return () => {
      window.removeEventListener('pointerup', onSvUp)
      window.removeEventListener('pointermove', onSvMove)
    }
  }, [])

  // editable fields -> update HSV
  function setFromHexInput(val) {
    const rgb = hexToRgbObj(val)
    if (!rgb) return
    const hsv = rgbToHsvObj(rgb.r, rgb.g, rgb.b)
    setPickerHsv(hsv)
    setPickedFromImage(null)
  }

  function setFromRgbInputs(r, g, b) {
    const rr = clamp(parseInt(r, 10) || 0, 0, 255)
    const gg = clamp(parseInt(g, 10) || 0, 0, 255)
    const bb = clamp(parseInt(b, 10) || 0, 0, 255)
    const hsv = rgbToHsvObj(rr, gg, bb)
    setPickerHsv(hsv)
    setPickedFromImage(null)
  }

  function setFromHslInputs(h, s, l) {
    const hh = clamp(parseInt(h, 10) || 0, 0, 360)
    const ss = clamp(parseInt(s, 10) || 0, 0, 100)
    const ll = clamp(parseInt(l, 10) || 0, 0, 100)
    const rgb = hslToRgbObj(hh, ss, ll)
    const hsv = rgbToHsvObj(rgb.r, rgb.g, rgb.b)
    setPickerHsv(hsv)
    setPickedFromImage(null)
  }

  async function copyAllWithImage() {
    const hex = pickerHex
    const rgbText = `${pickerRgb.r}, ${pickerRgb.g}, ${pickerRgb.b}`
    const hslText = `${pickerHsl.h}°, ${pickerHsl.s}%, ${pickerHsl.l}%`

    const textBlock = [
      `HEX: ${hex}`,
      `RGB: ${rgbText}`,
      `HSL: ${hslText}`,
      `Contrast: ${contrastText}`,
      `Source: ${sourceText}`,
    ].join('\n')

    const pngBlob = await swatchPngBlob({
      hex,
      rgbText,
      hslText,
      contrastText,
      sourceText,
    })

    const canCopyImage = !!window.ClipboardItem && !!navigator.clipboard?.write

    if (canCopyImage) {
      try {
        const item = new ClipboardItem({
          'text/plain': new Blob([textBlock], { type: 'text/plain' }),
          'image/png': pngBlob,
        })
        await navigator.clipboard.write([item])
        return
      } catch {
        // fall through
      }
    }

    // fallback: copy text + download image
    try { await navigator.clipboard.writeText(textBlock) } catch {}
    const url = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `practichue_${hex.replace('#','')}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ExpandedHeader = () => (
    <div className="expHeader">
      <div className="expBrand">
        <div className="logo" aria-hidden="true">🎨</div>
        <div className="expTitles">
          <div className="expTitleRow">
            <h1>PracticHue</h1>
            <span className={`statusDot ${backendOk ? 'ok' : backendOk === false ? 'bad' : 'muted'}`} aria-hidden="true" />
            <span className="expStatusText">{statusPill.text}</span>
          </div>
          <div className="sub">Full View • Capture • Upload • Palette</div>
        </div>
      </div>

      <div className="expActions">
  <button className="btn headerBtn" onClick={toggleTheme}>
    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
  </button>

  <button className="btn headerBtn" onClick={copyAll} disabled={!cards?.length}>
    Copy all
  </button>

  <button className="btn headerBtn" onClick={downloadJSON} disabled={!cards?.length}>
    Download JSON
  </button>

  <button
    className="btn primary headerBtn"
    onClick={() => refPreview && dataUrlToBlob(refPreview).then(analyze)}
    disabled={loading || !refPreview}
  >
    {loading ? 'Analyzing…' : 'Re-analyze'}
  </button>

  <button className="btn headerBtn" onClick={reset}>
    New Reference
  </button>

  <button
    className="iconbtn headerBtn"
    onClick={closeExpanded}
    title="Close tab"
    aria-label="Close tab"
  >
    ✕
  </button>
</div>

    </div>
  )

  if (!hydrated) {
    return (
      <div className={isExpanded ? "expShell" : "shell"}>
        <div className="panel">
          <p className="hint">Loading session…</p>
        </div>
      </div>
    )
  }

  /* =========================
     POPUP VIEW (compact)
     ========================= */
  if (!isExpanded) {
    return (
      <div className="shell" aria-label="PracticHue popup">
        <div className="topbar">
          <div className="brand">
            <div className="logo" aria-hidden="true">🎨</div>
            <div>
              <h1>PracticHue</h1>
              <div className="sub">Capture • Upload • Palette</div>
            </div>
          </div>

          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button className="iconbtn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="iconbtn" onClick={openExpanded} title="Expand" aria-label="Open full view">⤢</button>
            <button className="iconbtn" onClick={reset} title="Reset" aria-label="Reset to start">↺</button>
          </div>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        {step === 1 && (
          <>
            <div className="panel">
              <p className="hint">“See the world, steal the palette.” Capture your current tab or upload a reference.</p>
              <div style={{ height: 10 }} />

              <div className="row">
                <button className="btn primary" onClick={captureVisibleTab} disabled={loading}>
                  {loading ? 'Analyzing…' : '📸 Capture Tab'}
                </button>

                <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  📂 Upload Reference
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => onUploadFile(e.target.files?.[0])}
                  style={{ display: 'none' }}
                  aria-label="Upload a reference image"
                />
              </div>

              <div style={{ height: 10 }} />

              <div
                className="drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
                aria-label="Drag and drop an image here, or press Enter to upload"
              >
                <div className="file">
                  <label>Drop an image here</label>
                  <span className="pill">{statusPill.text}</span>
                </div>

                <div className="footerRow">
                  <div style={{ flex: 1 }}>
                    <div className="hint" style={{ marginBottom: 6 }}>Art style</div>
                    <select value={mode} onChange={(e) => setMode(e.target.value)}>
                      <option>Studio</option>
                      <option>Cinematic</option>
                      <option>Impressionist</option>
                    </select>
                  </div>
                  <div style={{ width: 110 }}>
                    <div className="hint" style={{ marginBottom: 6 }}>Colors</div>
                    <select value={k} onChange={(e) => setK(Number(e.target.value))}>
                      {[4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ Preview also in popup */}
            {refPreview && (
              <div className="panel">
                <div className="sectionTitle">
                  <h2>Reference</h2>
                  <div className="meta">preview</div>
                </div>
                <div className="preview">
                  <img src={refPreview} alt="Reference preview" />
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="panel">
              <div className="sectionTitle">
                <h2>Reference</h2>
                <div className="meta">tap colors to copy</div>
              </div>

              {refPreview && (
                <div className="preview" style={{ marginBottom: 10 }}>
                  <img src={refPreview} alt="Reference preview" />
                </div>
              )}

              <div className="sectionTitle">
                <h2>Palettes</h2>
                <div className="meta">scroll</div>
              </div>

              <PaletteCards
                cards={cards}
                onCopy={onCopy}
                formatColor={formatColor}
                debugFormat={displayFormat}
              />

              {insight && (
                <div className="insight" style={{ marginTop: 10 }}>
                  <strong>AI Insight ({insight.mode}):</strong> {insight.insight}
                </div>
              )}
            </div>

            <div className="row">
              <button className="btn" onClick={reset}>← New Reference</button>
              <button
                className="btn primary"
                onClick={() => refPreview && dataUrlToBlob(refPreview).then(analyze)}
                disabled={loading || !refPreview}
              >
                Re-analyze
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  /* =========================
     EXPANDED VIEW
     ========================= */
  return (
    <div className="expShell" aria-label="PracticHue expanded">
      <ExpandedHeader />
      {error && <div className="expToast" role="alert">{error}</div>}

      <div className="expBody">
        <div className="expLeft">
          <div className="expCard">
            <div className="sectionTitle">
              <h2>Capture / Upload</h2>
              <div className="meta">{statusPill.text}</div>
            </div>

            <div className="row captureRow">
              
              <button className="btn primary" onClick={captureVisibleTab} disabled={loading}>
                {loading ? 'Analyzing…' : '📸 Capture Tab'}
              </button>

              <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                📂 Upload Reference
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => onUploadFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
            </div>

            <div style={{ height: 10 }} />

            <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
              <div className="file">
                <label>Drop an image here</label>
                <span className="pill">{statusPill.text}</span>
              </div>

              <div className="footerRow">
                <div style={{ flex: 1 }}>
                  <div className="hint" style={{ marginBottom: 6 }}>Art style</div>
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option>Studio</option>
                    <option>Cinematic</option>
                    <option>Impressionist</option>
                  </select>
                </div>

                <div style={{ width: 130 }}>
                  <div className="hint" style={{ marginBottom: 6 }}>Colors</div>
                  <select value={k} onChange={(e) => setK(Number(e.target.value))}>
                    {[4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="expCard">
            <div className="sectionTitle">
              <h2>Reference</h2>
              <div className="meta">{refPreview ? 'preview' : 'none yet'}</div>
            </div>

            {refPreview ? (
              <div className="preview expPreview">
                <img
                  src={refPreview}
                  alt="Reference preview"
                  onClick={pickerOpen ? pickFromImage : undefined}
                  style={{ cursor: pickerOpen ? 'crosshair' : 'default' }}
                />
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 6 }}>Capture or upload an image to generate palettes.</p>
            )}
          </div>
        </div>

        <div className="expRight">
          <div className="expPalettesRow">
            <div className="expCard expPalettes">
              <div className="sectionTitle">
                <h2>Palettes</h2>
                <div className="meta">{cards?.length ? `${cards.length} cards` : 'no results yet'}</div>
              </div>

              {cards?.length ? (
                <PaletteCards
                  cards={cards}
                  onCopy={onCopy}
                  formatColor={formatColor}
                  debugFormat={displayFormat}
                />
              ) : (
                <p className="hint" style={{ marginTop: 6 }}>Your extracted palettes will show up here.</p>
              )}
            </div>

            <div className="expCard expInsight">
              <div className="sectionTitle">
                <h2>AI Insight</h2>
                <div className="meta">{insight?.mode || '—'}</div>
              </div>

              {insight ? (
                <div className="insight">
                  <strong>AI Insight ({insight.mode}):</strong> {insight.insight}
                </div>
              ) : (
                <p className="hint" style={{ marginTop: 6 }}>Run an analysis to generate an artistic insight.</p>
              )}

              {/* ✅ Consolidated “Format” control UNDER AI insight */}
              <div className="aiFormatCard">
                <div className="aiFormatHead">
                  <div className="aiFormatTitle">Swatch labels</div>
                  <div className="aiFormatMeta">HEX / RGB / HSL</div>
                </div>

                <div
  className="segmented"
  data-value={displayFormat}
  style={{
    // 3 segments: 0=hex,1=rgb,2=hsl
    ['--seg-index']: displayFormat === 'hex' ? 0 : displayFormat === 'rgb' ? 1 : 2,
    ['--seg-count']: 3,
  }}
>
  <span className="segIndicator" aria-hidden="true" />

  <button
    className={`segBtn ${displayFormat === 'hex' ? 'on' : ''}`}
    onClick={() => setDisplayFormat('hex')}
    type="button"
  >
    HEX
  </button>

  <button
    className={`segBtn ${displayFormat === 'rgb' ? 'on' : ''}`}
    onClick={() => setDisplayFormat('rgb')}
    type="button"
  >
    RGB
  </button>

  <button
    className={`segBtn ${displayFormat === 'hsl' ? 'on' : ''}`}
    onClick={() => setDisplayFormat('hsl')}
    type="button"
  >
    HSL
  </button>
</div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          SUPER LIQUID GLASS PICKER
         ========================= */}
      {pickerOpen && (
        <div className="colorPickerPanel superGlass">
          <div className="pickerTopbar">
            <div>
              <h2>Color Picker</h2>
              <div className="hintMini">Click the reference image to sample, or use the picker</div>
            </div>
            <button className="iconbtn" onClick={() => setPickerOpen(false)} aria-label="Close color picker" title="Close">
              ✕
            </button>
          </div>

          {/* SV square + Hue slider (Photoshop-ish layout) */}
          <div className="pickerCore">
            <div className="svBlock">
              <div
                ref={svRef}
                className="svSquare"
                style={{ ['--hue']: pickerHsv.h }}
                onPointerDown={onSvDown}
                role="application"
                aria-label="Saturation/Value picker"
              >
                <div
                  className="svKnob"
                  style={{
                    left: `${pickerHsv.s}%`,
                    top: `${100 - pickerHsv.v}%`,
                    background: pickerHex,
                  }}
                />
              </div>

              <div className="svSliders">
                <div className="miniSlider">
                  <div className="miniLabel">S</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={pickerHsv.s}
                    onChange={(e) => setPickerHsv(p => ({ ...p, s: Number(e.target.value) }))}
                    aria-label="Saturation"
                  />
                  <div className="miniValue">{pickerHsv.s}%</div>
                </div>

                <div className="miniSlider">
                  <div className="miniLabel">V</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={pickerHsv.v}
                    onChange={(e) => setPickerHsv(p => ({ ...p, v: Number(e.target.value) }))}
                    aria-label="Value"
                  />
                  <div className="miniValue">{pickerHsv.v}%</div>
                </div>
              </div>
            </div>

            <div className="rightRail">
              <div className="hueWrap">
                <div className="railLabel">Hue</div>
                <input
                  className="hueSlider"
                  type="range"
                  min="0"
                  max="360"
                  value={pickerHsv.h}
                  onChange={(e) => setPickerHsv(p => ({ ...p, h: Number(e.target.value) }))}
                  aria-label="Hue"
                />
              </div>

              <div className="pickedSwatch bigSwatch" style={{ background: pickerHex }} aria-label="Picked color preview" />

              <div className="pickedMeta">
                <div className="pickedHex">{pickerHex}</div>
                <div className="pickedSub">{sourceText}</div>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="pickedInfo">
            <div className="infoRow">
              <div className="infoLabel">HEX</div>
              <div className="infoValue">
                <input
                  className="valInput mono"
                  value={pickerHex}
                  onChange={(e) => setFromHexInput(e.target.value)}
                  aria-label="HEX input"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="infoRow">
              <div className="infoLabel">RGB</div>
              <div className="infoValue infoGrid3">
                <input className="valInput mono" value={pickerRgb.r} onChange={(e) => setFromRgbInputs(e.target.value, pickerRgb.g, pickerRgb.b)} aria-label="R" />
                <input className="valInput mono" value={pickerRgb.g} onChange={(e) => setFromRgbInputs(pickerRgb.r, e.target.value, pickerRgb.b)} aria-label="G" />
                <input className="valInput mono" value={pickerRgb.b} onChange={(e) => setFromRgbInputs(pickerRgb.r, pickerRgb.g, e.target.value)} aria-label="B" />
              </div>
            </div>

            <div className="infoRow">
              <div className="infoLabel">HSL</div>
              <div className="infoValue infoGrid3">
                <input className="valInput mono" value={pickerHsl.h} onChange={(e) => setFromHslInputs(e.target.value, pickerHsl.s, pickerHsl.l)} aria-label="H" />
                <input className="valInput mono" value={pickerHsl.s} onChange={(e) => setFromHslInputs(pickerHsl.h, e.target.value, pickerHsl.l)} aria-label="S" />
                <input className="valInput mono" value={pickerHsl.l} onChange={(e) => setFromHslInputs(pickerHsl.h, pickerHsl.s, e.target.value)} aria-label="L" />
              </div>
            </div>

            <div className="infoRow">
              <div className="infoLabel">Contrast</div>
              <div className="infoValue">{contrastText}</div>
            </div>
          </div>

          {/* Quick copy chips (square-ish + centered) */}
          <div className="copyChips" aria-label="Quick copy formats">
            <button className="chipBtn" onClick={() => onCopy(pickerHex)} type="button">
              ⧉ <span>HEX</span>
            </button>
            <button className="chipBtn" onClick={() => onCopy(`rgb(${pickerRgb.r}, ${pickerRgb.g}, ${pickerRgb.b})`)} type="button">
              ⧉ <span>RGB</span>
            </button>
            <button className="chipBtn" onClick={() => onCopy(`hsl(${pickerHsl.h}, ${pickerHsl.s}%, ${pickerHsl.l}%)`)} type="button">
              ⧉ <span>HSL</span>
            </button>
          </div>

          {/* Copy All */}
          <div className="pickerActions">
            <button className="btn primary copyAllBtn" onClick={copyAllWithImage}>
              Copy All
            </button>
          </div>
        </div>
      )}

      <button
        className="colorPickerFab"
        onClick={() => setPickerOpen(o => !o)}
        title="Pick a color"
        aria-label="Pick a color"
      >
        🎯
      </button>
    </div>
  )
}
