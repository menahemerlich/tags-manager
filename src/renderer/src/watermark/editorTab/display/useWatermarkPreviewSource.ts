import { useMemo } from 'react'
import type { WatermarkToolMode } from '../../watermarkTypes'

/** מצב מקורות תצוגה מקדימה של המדיה בבמה. */
export type WatermarkPreviewSourceState = {
  /** האם משתמשים בתצוגת blur מדויקת (מה־processor) במקום המדיה המקורית. */
  usesExactBlurPreview: boolean
  /** מקור התמונה לבמה (מקור רגיל או preview מעובד). */
  previewImageSrc: string | null
  /** האם בכלל מציגים את הבמה (תמונה או וידאו). */
  showWatermarkStage: boolean
}

/** פרמטרים לחישוב מקור תצוגה מקדימה. */
export type UseWatermarkPreviewSourceParams = {
  /** כלי פעיל (רלוונטי ל־blur). */
  activeTool: WatermarkToolMode
  /** מקור preview מעובד (blur) אם קיים. */
  processedPreviewSrc: string | null
  /** מקור התמונה הבסיסית (רגיל). */
  baseImageSrc: string | null
  /** URL של וידאו (אם המדיה היא וידאו). */
  baseVideoUrl: string | null
}

/** מחשב את מקור התצוגה בבמה: תמונה רגילה מול blur-preview, והאם הבמה מוצגת. */
export function useWatermarkPreviewSource(params: UseWatermarkPreviewSourceParams): WatermarkPreviewSourceState {
  /** האם יש preview מדויק עבור blur. */
  const usesExactBlurPreview = useMemo(() => params.activeTool === 'blur' && !!params.processedPreviewSrc, [params.activeTool, params.processedPreviewSrc])

  /** מקור התמונה עבור הבמה (אם אין preview מדויק, חוזרים לבסיס). */
  const previewImageSrc = useMemo(
    () => (usesExactBlurPreview ? params.processedPreviewSrc : params.baseImageSrc),
    [params.baseImageSrc, params.processedPreviewSrc, usesExactBlurPreview]
  )

  /** הבמה מוצגת אם יש מקור תמונה או וידאו. */
  const showWatermarkStage = useMemo(() => !!(previewImageSrc || params.baseVideoUrl), [params.baseVideoUrl, previewImageSrc])

  return { usesExactBlurPreview, previewImageSrc, showWatermarkStage }
}

