import { clampNumber } from '../../watermarkHelpers'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** אפשרויות למיקום ברירת מחדל של סימן מים. */
export type PlaceDefaultWatermarkOpts = { isVideo?: boolean }

/** מיקום ברירת מחדל לסימן המים (פינה ימין־תחתונה); בווידאו — קטן יותר ביחס לפריים. */
export function placeDefaultWatermark(
  baseWidth: number,
  baseHeight: number,
  aspectRatio: number,
  opts?: PlaceDefaultWatermarkOpts
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

