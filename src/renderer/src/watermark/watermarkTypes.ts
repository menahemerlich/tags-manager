import type { SelectionShape } from '../../../shared/types'

/** מצבי כלי בעורך סימן המים (ללא / חיתוך / טשטוש / טקסט / צורות). */
export type WatermarkToolMode = 'none' | 'crop' | 'blur' | 'text' | 'shapes'

/** צורת אזור הבחירה לחיתוך וטשטוש — תואם ל־shared. */
export type WatermarkSelectionShape = SelectionShape

/** מלבן בפיקסלי תמונה (מקור או ייצוא). */
export type WatermarkSelectionRect = { x: number; y: number; width: number; height: number }

/** ידית גרירה/שינוי גודל או כיוון. */
export type WatermarkSelectionHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** מינימום גודל מסגרת טקסט בפיקסלי תמונה. */
export const WATERMARK_TEXT_RECT_MIN_W = 80
export const WATERMARK_TEXT_RECT_MIN_H = 48

/** תוויות נגישות לידיות שינוי גודל מסגרת טקסט. */
export const WATERMARK_TEXT_HANDLE_LABEL: Record<Exclude<WatermarkSelectionHandle, 'move'>, string> = {
  n: 'קצה עליון',
  s: 'קצה תחתון',
  e: 'קצה ימני',
  w: 'קצה שמאלי',
  ne: 'פינה ימנית עליונה',
  nw: 'פינה שמאלית עליונה',
  se: 'פינה ימנית תחתונה',
  sw: 'פינה שמאלית תחתונה'
}

/** יישור טקסט בשכבת סימן המים. */
export type WatermarkTextAlign = 'left' | 'center' | 'right'

/** מצב עיצוב טקסט (צבעים, גופן, הדגשות). */
export type WatermarkTextStyleState = {
  color: string
  backgroundColor: string
  fontFamily: string
  fontSizePx: number
  bold: boolean
  italic: boolean
  underline: boolean
  textAlign: WatermarkTextAlign
}

/** רשומת תיבת טקסט אחת על התמונה. */
export type WatermarkTextRecord = WatermarkSelectionRect & {
  id: string
  content: string
  style: WatermarkTextStyleState
  rotation?: number
}

/** מצב אוברליי ייצוא (התקדמות וידאו או שם קובץ לתמונה). */
export type WatermarkExportOverlayState =
  | null
  | { kind: 'video'; percent: number; fileName: string }
  | { kind: 'image'; fileName: string }
