import {
  WATERMARK_TEXT_RECT_MIN_H,
  type WatermarkSelectionRect,
  type WatermarkTextRecord,
  type WatermarkTextStyleState
} from './watermarkTypes'

/** גודל גופן מינימלי לשכבת טקסט. */
export const WATERMARK_TEXT_FONT_SIZE_MIN = 8
/** מגבלת שורות לייצוא כדי למנוע עומס. */
export const WATERMARK_TEXT_EXPORT_MAX_LINES = 4000
/** תקרת פיקסלים לקנבס טקסט (בטיחות זיכרון). */
export const WATERMARK_TEXT_LAYER_MAX_PIXELS = 25_000_000

/** עובי מסגרת ויזואלית סביב אזור הטקסט (תואם CSS). */
export const WATERMARK_TEXT_OVERLAY_BORDER_PX = 1
export const WATERMARK_TEXT_MOVE_STRIP_CSS_PX = 0
export const WATERMARK_TEXT_STRIP_BORDER_BOTTOM_PX = 0
/** סף תנועה לפני שמתחילה גרירת המסגרת במקום מיקוד בשדה. */
export const WATERMARK_TEXT_MOVE_THRESHOLD_PX = 6
/** ריפוד פנימי של ה־textarea — תואם index.css. */
export const WATERMARK_TEXT_AREA_PAD_X = 8
export const WATERMARK_TEXT_AREA_PAD_Y = 6

/** ערכי ברירת מחדל לעיצוב טקסט בסימן המים. */
export const DEFAULT_WATERMARK_TEXT_STYLE: WatermarkTextStyleState = {
  color: '#000000',
  backgroundColor: 'transparent',
  fontFamily: 'Segoe UI, Tahoma, Arial, sans-serif',
  fontSizePx: 120,
  bold: false,
  italic: false,
  underline: false,
  textAlign: 'right'
}

/** רשימת גופנים לבחירה בפס הכלים. */
export const WATERMARK_TEXT_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Segoe UI', value: 'Segoe UI, Tahoma, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'David', value: 'David, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' }
]

/** יוצה מזהה ייחודי לתיבת טקסט חדשה. */
export function newWatermarkTextId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `wm-tx-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** גובה מסגרת תמונה לשורה אחת לפי גודל גופן (מסגרת+ריפוד+שורה). */
export function watermarkTextSingleLineImageHeightPx(fontSizePx: number): number {
  const border = WATERMARK_TEXT_OVERLAY_BORDER_PX
  const padY = WATERMARK_TEXT_AREA_PAD_Y
  const line = fontSizePx * 1.35
  return Math.max(WATERMARK_TEXT_RECT_MIN_H, Math.round(2 * border + 2 * padY + line))
}

/** מחשב את מלבן התוכן הפנימי לייצוא (בתוך המסגרת והריפוד). */
export function getWatermarkTextContentRectInImage(rect: WatermarkSelectionRect): WatermarkSelectionRect {
  const border = WATERMARK_TEXT_OVERLAY_BORDER_PX
  const stripTotal = WATERMARK_TEXT_MOVE_STRIP_CSS_PX + WATERMARK_TEXT_STRIP_BORDER_BOTTOM_PX
  const padX = WATERMARK_TEXT_AREA_PAD_X
  const padY = WATERMARK_TEXT_AREA_PAD_Y
  const innerW = rect.width - 2 * border
  const innerH = rect.height - 2 * border
  const textareaInnerH = innerH - stripTotal
  const w = Math.max(1, Math.round(innerW - 2 * padX))
  const h = Math.max(1, Math.round(textareaInnerH - 2 * padY))
  return {
    x: Math.round(rect.x + border + padX),
    y: Math.round(rect.y + border + stripTotal + padY),
    width: w,
    height: h
  }
}

/** גודל גופן ברירת מחדל לטקסט — בווידאו (רזולוציה גבוהה) קטן יחסית לפריים. */
export function defaultWatermarkTextFontSizeForMedia(
  baseWidth: number,
  baseHeight: number,
  isVideo: boolean
): number {
  if (!isVideo) return DEFAULT_WATERMARK_TEXT_STYLE.fontSizePx
  const shortSide = Math.min(baseWidth, baseHeight)
  return Math.max(28, Math.min(80, Math.round(shortSide * 0.04)))
}

export type CreateDefaultWatermarkTextItemOpts = { fontSizePx?: number; isVideo?: boolean }

/** יוצר תיבת טקסט ריקה במיקום ברירת מחדל על המדיה. */
export function createDefaultWatermarkTextItem(
  baseWidth: number,
  baseHeight: number,
  fontSizeOrOpts?: number | CreateDefaultWatermarkTextItemOpts
): WatermarkTextRecord {
  let fontSizePx = DEFAULT_WATERMARK_TEXT_STYLE.fontSizePx
  let isVideo = false

  if (typeof fontSizeOrOpts === 'number') {
    fontSizePx = fontSizeOrOpts
  } else if (fontSizeOrOpts) {
    isVideo = !!fontSizeOrOpts.isVideo
    if (typeof fontSizeOrOpts.fontSizePx === 'number') {
      fontSizePx = fontSizeOrOpts.fontSizePx
    } else if (isVideo) {
      fontSizePx = defaultWatermarkTextFontSizeForMedia(baseWidth, baseHeight, true)
    }
  }

  const widthFrac = isVideo ? 0.44 : 0.62
  const minBoxW = isVideo ? 120 : 200
  const w = Math.max(minBoxW, Math.round(baseWidth * widthFrac))
  const h = watermarkTextSingleLineImageHeightPx(fontSizePx)
  const x = Math.round((baseWidth - w) / 2)
  const y = Math.max(0, baseHeight - h - Math.round(baseHeight * (isVideo ? 0.04 : 0.05)))
  return {
    id: newWatermarkTextId(),
    x,
    y,
    width: w,
    height: h,
    content: '',
    style: { ...DEFAULT_WATERMARK_TEXT_STYLE, fontSizePx },
    rotation: 0
  }
}
