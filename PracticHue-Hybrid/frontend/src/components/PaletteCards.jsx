export default function PaletteCards({ cards = [], onCopy, formatColor, debugFormat }) {
  const fmt = (hex) =>
    typeof formatColor === 'function'
      ? formatColor(hex)
      : String(hex || '').toUpperCase()

  const normHex = (hex) => {
    const s = String(hex || '').trim()
    if (!s) return ''
    return s.startsWith('#') ? s.toUpperCase() : `#${s.toUpperCase()}`
  }

  return (
    <div className="hscroll" data-debug-format={debugFormat || 'none'}>
      {cards.map((card, idx) => (
        <div className="card" key={`${card?.name || card?.title || 'card'}-${idx}`}>
          <div className="cardHead">
            <div className="title">{card?.name || card?.title || `Palette ${idx + 1}`}</div>
            <div className="tag">{card?.tag || card?.category || 'Color Theory'}</div>
          </div>

          <div className="swatches">
            {(card?.colors || []).map((hex) => {
              const baseHex = normHex(hex)        // ✅ stable + safe for CSS background
              const label = fmt(baseHex)          // ✅ whatever your toggle returns (HEX/RGB/HSL)

              return (
                <button
                  key={baseHex || String(hex)}
                  className="swatch"
                  style={{ background: baseHex || '#000000' }}
                  onClick={() => onCopy?.(label)} // ✅ copy what you see
                  title={label}
                  type="button"
                >
                  <small>{label}</small>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
