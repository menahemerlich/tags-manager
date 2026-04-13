import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import type { WatermarkSelectionRect, WatermarkTextRecord } from '../../watermarkTypes'
import { WATERMARK_TEXT_RECT_MIN_H, WATERMARK_TEXT_RECT_MIN_W } from '../../watermarkTypes'
import { clampRectIntoBounds } from '../bounds/clampRectIntoBounds'
import { WATERMARK_CROP_SHAPE_MIN_PX } from '../constants'

/** תוצאת מיפוי שכבות לאחר חיתוך תמונה. */
export type MapLayersAfterImageCropResult = {
  watermarkRect: WatermarkSelectionRect | null
  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
}

/** אחרי חיתוך שמור — מזיז שכבות לקואורדינטות התמונה החדשה ומסנן מה שנחתך לחלוטין. */
export function mapLayersAfterImageCrop(
  cropX: number,
  cropY: number,
  newWidth: number,
  newHeight: number,
  watermarkRect: WatermarkSelectionRect | null,
  textItems: WatermarkTextRecord[],
  shapeItems: WatermarkShapeRecord[]
): MapLayersAfterImageCropResult {
  const size = { width: newWidth, height: newHeight }

  let nextWm: WatermarkSelectionRect | null = null
  if (watermarkRect) {
    const shifted = { ...watermarkRect, x: watermarkRect.x - cropX, y: watermarkRect.y - cropY }
    nextWm = clampRectIntoBounds(shifted, size, null)
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
      if (w < WATERMARK_CROP_SHAPE_MIN_PX || h < WATERMARK_CROP_SHAPE_MIN_PX) return null
      return { ...s, x: Math.round(x1), y: Math.round(y1), width: Math.round(w), height: Math.round(h) }
    })
    .filter((s): s is WatermarkShapeRecord => s !== null)

  return { watermarkRect: nextWm, textItems: nextTexts, shapeItems: nextShapes }
}

