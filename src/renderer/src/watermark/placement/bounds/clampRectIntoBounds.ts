import { clampNumber } from '../../watermarkHelpers'
import type { WatermarkSelectionRect } from '../../watermarkTypes'
import { getPlacementBounds } from './getPlacementBounds'
import { WATERMARK_MIN_LAYER_HEIGHT_PX, WATERMARK_MIN_LAYER_WIDTH_PX } from '../constants'

/** מגביל מלבן (סימן מים / טקסט) לגבולות תקינים. */
export function clampRectIntoBounds(
  rect: WatermarkSelectionRect,
  size: { width: number; height: number },
  crop: WatermarkSelectionRect | null
): WatermarkSelectionRect {
  const bounds = getPlacementBounds(size, crop)
  const width = clampNumber(rect.width, WATERMARK_MIN_LAYER_WIDTH_PX, Math.max(WATERMARK_MIN_LAYER_WIDTH_PX, bounds.width))
  const height = clampNumber(
    rect.height,
    WATERMARK_MIN_LAYER_HEIGHT_PX,
    Math.max(WATERMARK_MIN_LAYER_HEIGHT_PX, bounds.height)
  )
  return {
    width,
    height,
    x: Math.round(clampNumber(rect.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
    y: Math.round(clampNumber(rect.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
  }
}

