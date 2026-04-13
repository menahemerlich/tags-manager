import type { WatermarkSelectionRect } from '../../watermarkTypes'
import { WATERMARK_SELECTION_MIN_HEIGHT_PX, WATERMARK_SELECTION_MIN_WIDTH_PX } from '../constants'

/** יוצר מסגרת בחירה ראשונית במרכז המדיה. */
export function createDefaultSelectionRect(baseWidth: number, baseHeight: number): WatermarkSelectionRect {
  const width = Math.max(WATERMARK_SELECTION_MIN_WIDTH_PX, Math.round(baseWidth * 0.72))
  const height = Math.max(WATERMARK_SELECTION_MIN_HEIGHT_PX, Math.round(baseHeight * 0.72))
  return {
    width,
    height,
    x: Math.max(0, Math.round((baseWidth - width) / 2)),
    y: Math.max(0, Math.round((baseHeight - height) / 2))
  }
}

