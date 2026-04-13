import { DEFAULT_WATERMARK_TEXT_STYLE, watermarkTextSingleLineImageHeightPx } from '../../watermarkTextModel'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** מיקום ברירת מחדל לתיבת טקסט — רוחב רחב ושורה אחת ליד התחתית. */
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

