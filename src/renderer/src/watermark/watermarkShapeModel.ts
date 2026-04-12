/** Shape kinds available in the watermark Konva editor (expandable later). */
export type WatermarkShapeKind = 'rect' | 'ellipse' | 'triangle' | 'hexagon' | 'star' | 'arrow'

export type WatermarkShapeRecord = {
  id: string
  kind: WatermarkShapeKind
  /** Top-left of axis-aligned placement box (image pixels). */
  x: number
  y: number
  width: number
  height: number
  /** Degrees, rotation around box center. */
  rotation: number
  fill: string
  stroke: string
  strokeWidth: number
}

const WATERMARK_SHAPE_MIN_W = 24
const WATERMARK_SHAPE_MIN_H = 24
export const WATERMARK_SHAPE_STROKE_MAX = 120

export function watermarkShapeEffectiveStrokePx(strokeWidth: number, w: number, h: number): number {
  const wi = Math.max(1, Math.floor(w))
  const hi = Math.max(1, Math.floor(h))
  const maxByBox = Math.max(0, Math.min(wi, hi) - 2)
  return Math.max(0, Math.min(strokeWidth, WATERMARK_SHAPE_STROKE_MAX, maxByBox))
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `wm-sh-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Default fill when re-enabling מילוי after «ללא מילוי». */
export const DEFAULT_SHAPE_FILL = 'rgba(255,255,255,0.25)'

export function isShapeFillTransparent(fill: string): boolean {
  const s = fill.trim().toLowerCase()
  if (s === 'transparent' || s === 'none') return true
  const m = /^rgba?\(\s*([^)]+)\s*\)/.exec(s)
  if (m) {
    const parts = m[1].split(',').map((x) => x.trim())
    if (parts.length === 4) {
      const a = parseFloat(parts[3])
      return Number.isFinite(a) && a < 0.001
    }
  }
  return false
}

/** בווידאו ברירת המחדל קטנה יותר ביחס לפריים (רזולוציה גבוהה). */
const VIDEO_SHAPE_LAYOUT_SCALE = 0.52
const VIDEO_SHAPE_STROKE_SCALE = 0.45

export function createDefaultWatermarkShape(
  kind: WatermarkShapeKind,
  baseW: number,
  baseH: number,
  isVideo = false
): WatermarkShapeRecord {
  const layout = isVideo ? VIDEO_SHAPE_LAYOUT_SCALE : 1
  const w = Math.max(WATERMARK_SHAPE_MIN_W, Math.round(baseW * 0.18 * layout))
  const h = Math.max(WATERMARK_SHAPE_MIN_H, Math.round(baseH * 0.12 * layout))
  const strokeWidth = isVideo
    ? Math.max(5, Math.round(20 * VIDEO_SHAPE_STROKE_SCALE))
    : 20
  return {
    id: newId(),
    kind,
    x: Math.round((baseW - w) / 2),
    y: Math.round((baseH - h) / 2),
    width: w,
    height: h,
    rotation: 0,
    fill: DEFAULT_SHAPE_FILL,
    stroke: '#000000',
    strokeWidth
  }
}

export const WATERMARK_SHAPE_KIND_LABELS: Record<WatermarkShapeKind, string> = {
  rect: 'מלבן',
  ellipse: 'אליפסה',
  triangle: 'משולש',
  hexagon: 'משושה',
  star: 'כוכב',
  arrow: 'חץ'
}
