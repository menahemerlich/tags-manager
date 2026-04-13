import { useMemo } from 'react'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** מלבן תצוגה ביחידות DOM עבור שכבת מיקום. */
export type WatermarkDisplayRect = { left: number; top: number; width: number; height: number }

/** פרמטרים לחישוב מלבן תצוגה של סימן מים לפי גודל במה וגודל מדיה. */
export type UseWatermarkDisplayRectParams = {
  /** מלבן סימן מים ביחידות מדיה (פיקסלים של תמונה/וידאו). */
  watermarkRect: WatermarkSelectionRect | null
  /** גודל המדיה המקורית בפיקסלים. */
  baseImageSize: { width: number; height: number } | null
  /** גודל הבמה ב־DOM. */
  stageSize: { width: number; height: number }
}

/** מחשב מלבן תצוגה (DOM) לסימן מים מתוך מלבן במדיה. */
export function useWatermarkDisplayRect(params: UseWatermarkDisplayRectParams): WatermarkDisplayRect | null {
  /** מחשב סקייל וממיר קואורדינטות מדיה ל־DOM. */
  const displayRect = useMemo(() => {
    if (!params.watermarkRect || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return null
    /** יחס סקייל אופקי בין מדיה ל־DOM. */
    const scaleX = params.stageSize.width / params.baseImageSize.width
    /** יחס סקייל אנכי בין מדיה ל־DOM. */
    const scaleY = params.stageSize.height / params.baseImageSize.height
    return {
      left: params.watermarkRect.x * scaleX,
      top: params.watermarkRect.y * scaleY,
      width: params.watermarkRect.width * scaleX,
      height: params.watermarkRect.height * scaleY
    }
  }, [params.baseImageSize, params.stageSize.height, params.stageSize.width, params.watermarkRect])

  return displayRect
}

