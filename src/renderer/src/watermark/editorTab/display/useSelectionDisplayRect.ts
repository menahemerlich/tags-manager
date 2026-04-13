import { useMemo } from 'react'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** מלבן תצוגה של בחירה (crop/blur) ביחידות DOM. */
export type SelectionDisplayRect = { left: number; top: number; width: number; height: number }

/** פרמטרים לחישוב מלבן תצוגה לבחירה לפי גודל במה וגודל מדיה. */
export type UseSelectionDisplayRectParams = {
  /** מלבן הבחירה ביחידות מדיה. */
  selectionRect: WatermarkSelectionRect | null
  /** גודל המדיה המקורית בפיקסלים. */
  baseImageSize: { width: number; height: number } | null
  /** גודל הבמה ב־DOM. */
  stageSize: { width: number; height: number }
}

/** מחשב מלבן תצוגה (DOM) לכלי בחירה (חיתוך/טשטוש). */
export function useSelectionDisplayRect(params: UseSelectionDisplayRectParams): SelectionDisplayRect | null {
  /** ממיר קואורדינטות מהמדיה למסך לפי סקייל. */
  const displaySelectionRect = useMemo(() => {
    if (!params.selectionRect || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return null
    /** יחס סקייל אופקי בין מדיה ל־DOM. */
    const scaleX = params.stageSize.width / params.baseImageSize.width
    /** יחס סקייל אנכי בין מדיה ל־DOM. */
    const scaleY = params.stageSize.height / params.baseImageSize.height
    return {
      left: params.selectionRect.x * scaleX,
      top: params.selectionRect.y * scaleY,
      width: params.selectionRect.width * scaleX,
      height: params.selectionRect.height * scaleY
    }
  }, [params.baseImageSize, params.selectionRect, params.stageSize.height, params.stageSize.width])

  return displaySelectionRect
}

