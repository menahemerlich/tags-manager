import { clampNumber } from './watermarkHelpers'
import type { WatermarkShapeRecord } from './watermarkShapeModel'
import { DEFAULT_WATERMARK_TEXT_STYLE, watermarkTextSingleLineImageHeightPx } from './watermarkTextModel'
import {
  WATERMARK_TEXT_RECT_MIN_H,
  WATERMARK_TEXT_RECT_MIN_W,
  type WatermarkSelectionRect,
  type WatermarkTextRecord
} from './watermarkTypes'

const CROP_SHAPE_MIN = 24

/** מיקום ברירת מחדל לסימן המים (פינה ימין־תחתונה). בווידאו — קטן יותר ביחס לפריים. */
export function placeDefaultWatermark(
  baseWidth: number,
  baseHeight: number,
  aspectRatio: number,
  opts?: { isVideo?: boolean }
): WatermarkSelectionRect {
  const isVideo = opts?.isVideo ?? false
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  const widthFrac = isVideo ? 0.13 : 0.22
  const inset = isVideo ? 16 : 24
  const width = clampNumber(Math.round(baseWidth * widthFrac), 48, Math.max(48, baseWidth))
  const height = clampNumber(Math.round(width / ratio), 48, Math.max(48, baseHeight))
  return {
    width,
    height,
    x: Math.max(0, baseWidth - width - inset),
    y: Math.max(0, baseHeight - height - inset)
  }
}

/** מסגרת בחירה ראשונית במרכז התמונה. */
export function createDefaultSelectionRect(baseWidth: number, baseHeight: number): WatermarkSelectionRect {
  const width = Math.max(80, Math.round(baseWidth * 0.72))
  const height = Math.max(80, Math.round(baseHeight * 0.72))
  return {
    width,
    height,
    x: Math.max(0, Math.round((baseWidth - width) / 2)),
    y: Math.max(0, Math.round((baseHeight - height) / 2))
  }
}

/** תיבת טקסט ברירת מחדל — רוחב רחב, שורה אחת ליד התחתית. */
export function placeDefaultTextRect(
  baseWidth: number,
  baseHeight: number,
  fontSizePx: number = DEFAULT_WATERMARK_TEXT_STYLE.fontSizePx
): WatermarkSelectionRect {
  const w = Math.max(200, Math.round(baseWidth * 0.62))
  const h = watermarkTextSingleLineImageHeightPx(fontSizePx)
  const x = Math.round((baseWidth - w) / 2)
  const y = Math.max(0, baseHeight - h - Math.round(baseHeight * 0.05))
  return { x, y, width: w, height: h }
}

/** אזור תקן לצורות/טקסט — כל התמונה או תוצאת חיתוך. */
export function getPlacementBounds(size: { width: number; height: number }, crop: WatermarkSelectionRect | null) {
  if (!crop) return { x: 0, y: 0, width: size.width, height: size.height }
  return crop
}

/** מגביל מלבן (סימן מים / טקסט) לגבולות תקינים. */
export function clampWatermarkIntoBounds(
  rect: WatermarkSelectionRect,
  size: { width: number; height: number },
  crop: WatermarkSelectionRect | null
): WatermarkSelectionRect {
  const bounds = getPlacementBounds(size, crop)
  const width = clampNumber(rect.width, 40, Math.max(40, bounds.width))
  const height = clampNumber(rect.height, 40, Math.max(40, bounds.height))
  return {
    width,
    height,
    x: Math.round(clampNumber(rect.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
    y: Math.round(clampNumber(rect.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
  }
}

/** אחרי חיתוך שמור — מזיז שכבות לקואורדינטות של התמונה החדשה ומסנן מה שנחתך לחלוטין. */
export function mapLayersAfterImageCrop(
  cropX: number,
  cropY: number,
  newWidth: number,
  newHeight: number,
  watermarkRect: WatermarkSelectionRect | null,
  textItems: WatermarkTextRecord[],
  shapeItems: WatermarkShapeRecord[]
): {
  watermarkRect: WatermarkSelectionRect | null
  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
} {
  const size = { width: newWidth, height: newHeight }
  let nextWm: WatermarkSelectionRect | null = null
  if (watermarkRect) {
    const shifted = {
      ...watermarkRect,
      x: watermarkRect.x - cropX,
      y: watermarkRect.y - cropY
    }
    nextWm = clampWatermarkIntoBounds(shifted, size, null)
  }
  const nextTexts = textItems
    .map((t) => {
      const shifted = { ...t, x: t.x - cropX, y: t.y - cropY }
      const x1 = Math.max(0, shifted.x)
      const y1 = Math.max(0, shifted.y)
      const x2 = Math.min(newWidth, shifted.x + shifted.width)
      const y2 = Math.min(newHeight, shifted.y + shifted.height)
      const w = x2 - x1
      const h = y2 - y1
      if (w < WATERMARK_TEXT_RECT_MIN_W || h < WATERMARK_TEXT_RECT_MIN_H) return null
      return { ...t, x: Math.round(x1), y: Math.round(y1), width: Math.round(w), height: Math.round(h) }
    })
    .filter((t): t is WatermarkTextRecord => t !== null)

  const nextShapes = shapeItems
    .map((s) => {
      const shifted = { ...s, x: s.x - cropX, y: s.y - cropY }
      const x1 = Math.max(0, shifted.x)
      const y1 = Math.max(0, shifted.y)
      const x2 = Math.min(newWidth, shifted.x + shifted.width)
      const y2 = Math.min(newHeight, shifted.y + shifted.height)
      const w = x2 - x1
      const h = y2 - y1
      if (w < CROP_SHAPE_MIN || h < CROP_SHAPE_MIN) return null
      return { ...s, x: Math.round(x1), y: Math.round(y1), width: Math.round(w), height: Math.round(h) }
    })
    .filter((s): s is WatermarkShapeRecord => s !== null)

  return { watermarkRect: nextWm, textItems: nextTexts, shapeItems: nextShapes }
}
