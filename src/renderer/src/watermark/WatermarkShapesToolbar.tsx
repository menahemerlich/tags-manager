import type { Dispatch, SetStateAction } from 'react'
import { WATERMARK_SHAPE_KIND_ORDER, WatermarkShapeGlyph } from './watermarkShapeGlyphs'
import {
  createDefaultWatermarkShape,
  DEFAULT_SHAPE_FILL,
  isShapeFillTransparent,
  WATERMARK_SHAPE_KIND_LABELS,
  WATERMARK_SHAPE_STROKE_MAX,
  watermarkShapeEffectiveStrokePx,
  type WatermarkShapeRecord
} from './watermarkShapeModel'

/** פס צורות מתחת לתצוגה — הוספה, מחיקה, מילוי ומסגרת. */
export function WatermarkShapesToolbar({
  baseImageSize,
  baseIsVideo,
  selectedShapeId,
  setSelectedShapeId,
  setShapeItems,
  selectedShape,
  onMoveLayerForward,
  onMoveLayerBackward,
  canMoveForward,
  canMoveBackward
}: {
  baseImageSize: { width: number; height: number }
  baseIsVideo: boolean
  selectedShapeId: string | null
  setSelectedShapeId: Dispatch<SetStateAction<string | null>>
  setShapeItems: Dispatch<SetStateAction<WatermarkShapeRecord[]>>
  selectedShape: WatermarkShapeRecord | null
  onMoveLayerForward: () => void
  onMoveLayerBackward: () => void
  canMoveForward: boolean
  canMoveBackward: boolean
}) {
  return (
    <div className="watermark-text-toolbar">
      <div className="watermark-text-toolbar-row watermark-text-toolbar-controls watermark-shapes-inline-row">
        <div className="watermark-shapes-inline-palette" role="group" aria-label="הוספת צורה">
          {WATERMARK_SHAPE_KIND_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn watermark-shape-inline-add-btn"
              title={`הוסף ${WATERMARK_SHAPE_KIND_LABELS[kind]}`}
              aria-label={`הוסף ${WATERMARK_SHAPE_KIND_LABELS[kind]}`}
              onClick={() => {
                const s = createDefaultWatermarkShape(kind, baseImageSize.width, baseImageSize.height, baseIsVideo)
                setShapeItems((prev) => [...prev, s])
                setSelectedShapeId(s.id)
              }}
            >
              <WatermarkShapeGlyph kind={kind} />
              <span className="watermark-shape-inline-add-label">{WATERMARK_SHAPE_KIND_LABELS[kind]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn watermark-shape-delete-btn"
          disabled={!selectedShapeId}
          onClick={() => {
            if (!selectedShapeId) return
            setShapeItems((prev) => prev.filter((s) => s.id !== selectedShapeId))
            setSelectedShapeId(null)
          }}
          title="מחק צורה נבחרת"
          aria-label="מחק צורה נבחרת"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
        </button>
      </div>
      {selectedShape && (
        <div className="watermark-text-toolbar-row watermark-text-toolbar-controls">
          <label className="watermark-text-toolbar-label tight">מילוי</label>
          <input
            type="color"
            className="watermark-shape-color-input"
            disabled={isShapeFillTransparent(selectedShape.fill)}
            value={selectedShape.fill.startsWith('#') ? selectedShape.fill : '#ffffff'}
            onChange={(e) => {
              const v = e.target.value
              setShapeItems((items) => items.map((s) => (s.id === selectedShape.id ? { ...s, fill: v } : s)))
            }}
            title="צבע מילוי"
            aria-label="צבע מילוי"
          />
          <label className="watermark-text-toolbar-label tight" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input
              type="checkbox"
              checked={isShapeFillTransparent(selectedShape.fill)}
              onChange={(e) => {
                const noFill = e.target.checked
                setShapeItems((items) =>
                  items.map((s) =>
                    s.id === selectedShape.id ? { ...s, fill: noFill ? 'transparent' : DEFAULT_SHAPE_FILL } : s
                  )
                )
              }}
            />
            ללא מילוי
          </label>
          <span className="watermark-text-toolbar-divider" aria-hidden="true" />
          <label className="watermark-text-toolbar-label tight">מסגרת</label>
          <input
            type="color"
            className="watermark-shape-color-input"
            value={selectedShape.stroke.startsWith('#') ? selectedShape.stroke : '#000000'}
            onChange={(e) => {
              const v = e.target.value
              setShapeItems((items) => items.map((s) => (s.id === selectedShape.id ? { ...s, stroke: v } : s)))
            }}
            title="צבע מסגרת"
            aria-label="צבע מסגרת"
          />
          <label className="watermark-text-toolbar-label tight">עובי</label>
          <input
            type="range"
            className="watermark-shape-stroke-range"
            min={0}
            max={WATERMARK_SHAPE_STROKE_MAX}
            step={1}
            value={Math.min(selectedShape.strokeWidth, WATERMARK_SHAPE_STROKE_MAX)}
            onChange={(e) => {
              const n = Number(e.target.value)
              setShapeItems((items) => items.map((s) => (s.id === selectedShape.id ? { ...s, strokeWidth: n } : s)))
            }}
            title="עובי מסגרת"
            aria-label="עובי מסגרת"
          />
          <span className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {watermarkShapeEffectiveStrokePx(selectedShape.strokeWidth, selectedShape.width, selectedShape.height)}
            px
          </span>
          <span className="watermark-text-toolbar-divider" aria-hidden="true" />
          <span className="watermark-text-toolbar-label tight">שכבה</span>
          <div className="watermark-toolbar-layer-group" role="group" aria-label="סדר שכבה מול טקסט">
            <button
              type="button"
              className="btn watermark-toolbar-layer-btn"
              disabled={!selectedShapeId || !canMoveBackward}
              title="העבר אחורה (מתחת לשכבה הבאה)"
              onClick={onMoveLayerBackward}
            >
              אחורה
            </button>
            <button
              type="button"
              className="btn watermark-toolbar-layer-btn"
              disabled={!selectedShapeId || !canMoveForward}
              title="העבר קדימה (מעל השכבה הבאה)"
              onClick={onMoveLayerForward}
            >
              קדימה
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
