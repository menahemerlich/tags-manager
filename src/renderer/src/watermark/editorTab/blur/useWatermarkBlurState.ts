import { useMemo } from 'react'
import type { BlurParams, BlurSelection } from '../../../../../shared/types'
import { clampNumber } from '../../watermarkHelpers'
import type { WatermarkSelectionRect, WatermarkSelectionShape } from '../../watermarkTypes'

/** תוצאת חישובי blur נגזרים: preview feather + selection + params. */
export type WatermarkBlurState = {
  /** ערך feather “לתצוגה” ב־DOM (פיקסלים), נגזר מגודל הבחירה והגדרות feather. */
  blurFeatherPreviewPx: number
  /** בחירה לטשטוש במונחי מדיה (ל־processor). */
  blurSelection: BlurSelection | null
  /** פרמטרים לטשטוש (ל־processor). */
  blurParams: BlurParams
}

/** פרמטרים לחישוב מצב blur נגזר בבמה. */
export type UseWatermarkBlurStateParams = {
  /** מלבן בחירה (crop/blur) במונחי מדיה. */
  selectionRect: WatermarkSelectionRect | null
  /** צורת בחירה (מלבן/עיגול). */
  selectionShape: WatermarkSelectionShape
  /** מידות מדיה בסיסית. */
  baseImageSize: { width: number; height: number } | null
  /** גודל הבמה ב־DOM. */
  stageSize: { width: number; height: number }
  /** רוחב feather בהגדרות (0–100). */
  blurFeather: number
  /** עוצמת blur. */
  blurStrength: number
  /** separation לפוקוס. */
  focusSeparation: number
}

/** מרכז חישובי blur נגזרים כדי להשאיר את הטאב קריא ורזה. */
export function useWatermarkBlurState(params: UseWatermarkBlurStateParams): WatermarkBlurState {
  /** מחשב feather ב־DOM לפי מינימום המימד של הבחירה, ביחס לגודל הבמה. */
  const blurFeatherPreviewPx = useMemo(() => {
    if (!params.selectionRect || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return 0
    /** יחס סקייל אופקי בין מדיה ל־DOM. */
    const scaleX = params.stageSize.width / params.baseImageSize.width
    /** יחס סקייל אנכי בין מדיה ל־DOM. */
    const scaleY = params.stageSize.height / params.baseImageSize.height
    /** מימד מינימלי ב־DOM של הבחירה (מונע feather ענק). */
    const minDimension = Math.max(1, Math.min(params.selectionRect.width * scaleX, params.selectionRect.height * scaleY))
    return clampNumber(Math.round(minDimension * 0.7 * (params.blurFeather / 100)), 0, Math.round(minDimension * 0.8))
  }, [params.baseImageSize, params.blurFeather, params.selectionRect, params.stageSize.height, params.stageSize.width])

  /** ממיר selectionRect ל־BlurSelection עבור blur processor. */
  const blurSelection = useMemo<BlurSelection | null>(() => {
    if (!params.selectionRect) return null
    return {
      x: params.selectionRect.x,
      y: params.selectionRect.y,
      width: params.selectionRect.width,
      height: params.selectionRect.height,
      shape: params.selectionShape
    }
  }, [params.selectionRect, params.selectionShape])

  /** פרמטרים ל־blur processor. */
  const blurParams = useMemo<BlurParams>(
    () => ({
      blurStrength: params.blurStrength,
      blurFeather: params.blurFeather,
      focusSeparation: params.focusSeparation
    }),
    [params.blurFeather, params.blurStrength, params.focusSeparation]
  )

  return { blurFeatherPreviewPx, blurSelection, blurParams }
}

