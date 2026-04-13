import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** מחזיר גבולות מיקום לשכבות: כל המדיה או גבולות חיתוך פעילים. */
export function getPlacementBounds(
  size: { width: number; height: number },
  crop: WatermarkSelectionRect | null
): WatermarkSelectionRect {
  if (!crop) return { x: 0, y: 0, width: size.width, height: size.height }
  return crop
}

