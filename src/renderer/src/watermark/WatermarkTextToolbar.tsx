import type { Dispatch, SetStateAction } from 'react'
import {
  WATERMARK_TEXT_FONT_OPTIONS,
  WATERMARK_TEXT_FONT_SIZE_MIN,
  createDefaultWatermarkTextItem
} from './watermarkTextModel'
import type { WatermarkTextRecord } from './watermarkTypes'

/** פס טקסט מתחת לתצוגה — תיבה חדשה, צבעים, גופן ויישור. */
export function WatermarkTextToolbar({
  baseImageSize,
  baseIsVideo,
  textItems,
  setTextItems,
  selectedTextId,
  setSelectedTextId,
  selectedText,
  watermarkTextFrameOpen,
  setWatermarkTextFrameOpen,
  onMoveLayerForward,
  onMoveLayerBackward,
  canMoveForward,
  canMoveBackward
}: {
  baseImageSize: { width: number; height: number }
  baseIsVideo: boolean
  textItems: WatermarkTextRecord[]
  setTextItems: Dispatch<SetStateAction<WatermarkTextRecord[]>>
  selectedTextId: string | null
  setSelectedTextId: Dispatch<SetStateAction<string | null>>
  selectedText: WatermarkTextRecord | null
  watermarkTextFrameOpen: boolean
  setWatermarkTextFrameOpen: Dispatch<SetStateAction<boolean>>
  onMoveLayerForward: () => void
  onMoveLayerBackward: () => void
  canMoveForward: boolean
  canMoveBackward: boolean
}) {
  return (
    <div className="watermark-text-toolbar">
      {!(selectedTextId && watermarkTextFrameOpen && selectedText) ? (
        <div className="watermark-text-toolbar-row watermark-text-toolbar-controls">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const t = createDefaultWatermarkTextItem(baseImageSize.width, baseImageSize.height, {
                isVideo: baseIsVideo
              })
              setTextItems((prev) => [...prev, t])
              setSelectedTextId(t.id)
              setWatermarkTextFrameOpen(true)
            }}
          >
            {textItems.length > 0 ? 'הוסף תיבת טקסט חדשה' : 'הוסף תיבת טקסט'}
          </button>
        </div>
      ) : (
        selectedText && (
          <>
            <div className="watermark-text-toolbar-row watermark-text-toolbar-controls watermark-text-toolbar-row-main">
              <button
                type="button"
                className="btn watermark-shape-delete-btn"
                title="מחק תיבת טקסט"
                aria-label="מחק תיבת טקסט"
                onClick={() => {
                  if (!selectedTextId) return
                  setTextItems((prev) => prev.filter((x) => x.id !== selectedTextId))
                  setSelectedTextId(null)
                  setWatermarkTextFrameOpen(false)
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </button>
              <span className="watermark-text-toolbar-divider" aria-hidden="true" />
              <label className="watermark-text-toolbar-label tight">צבע</label>
              <input
                type="color"
                value={selectedText.style.color.startsWith('#') ? selectedText.style.color : '#000000'}
                onChange={(e) => {
                  const v = e.target.value
                  setTextItems((items) =>
                    items.map((it) => (it.id === selectedTextId ? { ...it, style: { ...it.style, color: v } } : it))
                  )
                }}
                title="צבע טקסט"
              />
              <label className="watermark-text-toolbar-label tight">רקע</label>
              <input
                type="color"
                value={
                  selectedText.style.backgroundColor.startsWith('#') ? selectedText.style.backgroundColor : '#000000'
                }
                onChange={(e) => {
                  const v = e.target.value
                  setTextItems((items) =>
                    items.map((it) =>
                      it.id === selectedTextId ? { ...it, style: { ...it.style, backgroundColor: v } } : it
                    )
                  )
                }}
                title="רקע תיבת טקסט"
              />
              <button
                type="button"
                className="btn watermark-text-style-btn"
                onClick={() => {
                  setTextItems((items) =>
                    items.map((it) =>
                      it.id === selectedTextId ? { ...it, style: { ...it.style, backgroundColor: 'transparent' } } : it
                    )
                  )
                }}
                title="ללא רקע"
              >
                ∅
              </button>
              <label className="watermark-text-toolbar-label tight">גודל</label>
              <input
                type="number"
                className="watermark-text-fontsize-input"
                min={WATERMARK_TEXT_FONT_SIZE_MIN}
                step={1}
                value={selectedText.style.fontSizePx}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') return
                  const n = parseInt(raw, 10)
                  if (Number.isNaN(n)) return
                  setTextItems((items) =>
                    items.map((it) =>
                      it.id === selectedTextId
                        ? {
                            ...it,
                            style: {
                              ...it.style,
                              fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, n)
                            }
                          }
                        : it
                    )
                  )
                }}
                onBlur={(e) => {
                  const raw = e.target.value
                  if (raw === '' || Number.isNaN(parseInt(raw, 10))) {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId
                          ? {
                              ...it,
                              style: {
                                ...it.style,
                                fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, it.style.fontSizePx)
                              }
                            }
                          : it
                      )
                    )
                  }
                }}
                title="גודל גופן בפיקסלים (ללא תקרה)"
                aria-label="גודל גופן בפיקסלים"
              />
              <label className="watermark-text-toolbar-label tight">גופן</label>
              <select
                value={selectedText.style.fontFamily}
                onChange={(e) => {
                  const v = e.target.value
                  setTextItems((items) =>
                    items.map((it) => (it.id === selectedTextId ? { ...it, style: { ...it.style, fontFamily: v } } : it))
                  )
                }}
              >
                {WATERMARK_TEXT_FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="watermark-text-toolbar-row watermark-text-toolbar-controls watermark-text-toolbar-row-align">
              <span className="watermark-text-toolbar-label tight">יישור</span>
              <div className="watermark-text-align-group" role="group" aria-label="יישור טקסט">
                <button
                  type="button"
                  className={`btn watermark-text-align-btn ${selectedText.style.textAlign === 'right' ? 'primary' : ''}`}
                  title="יישור לימין"
                  aria-label="יישור לימין"
                  aria-pressed={selectedText.style.textAlign === 'right'}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, textAlign: 'right' } } : it
                      )
                    )
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <g transform="translate(24 0) scale(-1 1)">
                      <path
                        fill="currentColor"
                        d="M4 5L14 5L14 7L4 7ZM4 9L18 9L18 11L4 11ZM4 13L12 13L12 15L4 15ZM4 17L16 17L16 19L4 19Z"
                      />
                    </g>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`btn watermark-text-align-btn ${selectedText.style.textAlign === 'center' ? 'primary' : ''}`}
                  title="יישור לאמצע"
                  aria-label="יישור לאמצע"
                  aria-pressed={selectedText.style.textAlign === 'center'}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, textAlign: 'center' } } : it
                      )
                    )
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M7 5L17 5L17 7L7 7ZM5 9L19 9L19 11L5 11ZM6 13L18 13L18 15L6 15ZM7 17L17 17L17 19L7 19Z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`btn watermark-text-align-btn ${selectedText.style.textAlign === 'left' ? 'primary' : ''}`}
                  title="יישור לשמאל"
                  aria-label="יישור לשמאל"
                  aria-pressed={selectedText.style.textAlign === 'left'}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, textAlign: 'left' } } : it
                      )
                    )
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M4 5L14 5L14 7L4 7ZM4 9L18 9L18 11L4 11ZM4 13L12 13L12 15L4 15ZM4 17L16 17L16 19L4 19Z"
                    />
                  </svg>
                </button>
              </div>
              <span className="watermark-text-toolbar-divider" aria-hidden="true" />
              <div className="watermark-text-align-group" role="group" aria-label="הדגשה ונטוי">
                <button
                  type="button"
                  className={`btn watermark-text-style-btn ${selectedText.style.bold ? 'primary' : ''}`}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, bold: !it.style.bold } } : it
                      )
                    )
                  }}
                  title="מודגש"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className={`btn watermark-text-style-btn ${selectedText.style.italic ? 'primary' : ''}`}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, italic: !it.style.italic } } : it
                      )
                    )
                  }}
                  title="נטוי"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={`btn watermark-text-style-btn ${selectedText.style.underline ? 'primary' : ''}`}
                  onClick={() => {
                    setTextItems((items) =>
                      items.map((it) =>
                        it.id === selectedTextId ? { ...it, style: { ...it.style, underline: !it.style.underline } } : it
                      )
                    )
                  }}
                  title="קו תחתון"
                  aria-label="קו תחתון"
                  aria-pressed={selectedText.style.underline}
                >
                  <span style={{ textDecoration: 'underline' }}>U</span>
                </button>
              </div>
              {textItems.length > 0 && (
                <>
                  <span className="watermark-text-toolbar-divider" aria-hidden="true" />
                  <span className="watermark-text-toolbar-label tight">שכבה</span>
                  <div className="watermark-toolbar-layer-group" role="group" aria-label="סדר שכבה מול צורות">
                    <button
                      type="button"
                      className="btn watermark-toolbar-layer-btn"
                      disabled={!selectedTextId || !canMoveBackward}
                      title="העבר אחורה (מתחת לשכבה הבאה)"
                      onClick={onMoveLayerBackward}
                    >
                      אחורה
                    </button>
                    <button
                      type="button"
                      className="btn watermark-toolbar-layer-btn"
                      disabled={!selectedTextId || !canMoveForward}
                      title="העבר קדימה (מעל השכבה הבאה)"
                      onClick={onMoveLayerForward}
                    >
                      קדימה
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )
      )}
    </div>
  )
}
