import { useCallback } from 'react'
import { createDefaultSelectionRect } from '../../watermarkPlacement'
import { isWatermarkVideoPath } from '../../watermarkHelpers'
import type { WatermarkSelectionRect, WatermarkToolMode } from '../../watermarkTypes'

/** פרמטרים להפעלת כלים בעורך (כולל יצירת מלבן בחירה ברירת מחדל). */
export type UseWatermarkToolActivationParams = {
  /** נתיב המדיה הבסיסית (אם קיים). */
  baseImagePath: string | null
  /** מידות המדיה הבסיסית (אם כבר נטענו). */
  baseImageSize: { width: number; height: number } | null
  /** setter לשגיאת עורך. */
  setEditorError: (v: string | null) => void
  /** setter לכלי פעיל. */
  setActiveTool: (v: WatermarkToolMode) => void
  /** setter לפתיחת מסגרת טקסט. */
  setWatermarkTextFrameOpen: (v: boolean) => void
  /** setter למלבן בחירה. */
  setSelectionRect: (updater: (prev: WatermarkSelectionRect | null) => WatermarkSelectionRect | null) => void
}

/** תוצאת hook להפעלת כלים ולוודא שיש מלבן בחירה כשצריך. */
export type WatermarkToolActivation = {
  /** מבטיח שקיים מלבן בחירה כשעוברים לכלי שדורש בחירה. */
  ensureSelectionRect: () => void
  /** מפעיל כלי לפי כללי המדיה (חוסם crop/blur בוידאו). */
  activateTool: (tool: WatermarkToolMode) => void
}

/** מרכז לוגיקת הפעלת כלים כדי להשאיר את הטאב רזה וקריא. */
export function useWatermarkToolActivation(params: UseWatermarkToolActivationParams): WatermarkToolActivation {
  /** יוצר מלבן בחירה ברירת מחדל אם חסר, כשיש מידות מדיה. */
  const ensureSelectionRect = useCallback(() => {
    /** מידות המדיה כשהן זמינות (מונע non-null assertions). */
    const size = params.baseImageSize
    if (!size) return
    params.setSelectionRect((prev) => prev ?? createDefaultSelectionRect(size.width, size.height))
  }, [params])

  /** מפעיל כלי לפי מצב המדיה והגבלות וידאו. */
  const activateTool = useCallback(
    (tool: WatermarkToolMode) => {
      if (params.baseImagePath && isWatermarkVideoPath(params.baseImagePath) && (tool === 'crop' || tool === 'blur')) {
        params.setEditorError('כלי חיתוך וטשטוש אינם זמינים כשהמדיה הראשית היא וידאו.')
        return
      }
      if (!params.baseImageSize && tool !== 'none') {
        params.setEditorError('ממתין לטעינת המדיה או בחר קובץ ראשי לפני שימוש בכלים.')
        return
      }
      if (tool !== 'text') {
        params.setWatermarkTextFrameOpen(false)
      }
      if (tool === 'text') {
        params.setEditorError(null)
        params.setActiveTool('text')
        params.setWatermarkTextFrameOpen(false)
        return
      }
      if (tool === 'shapes') {
        params.setEditorError(null)
        params.setActiveTool('shapes')
        return
      }
      params.setEditorError(null)
      params.setActiveTool(tool)
      if (tool !== 'none') ensureSelectionRect()
    },
    [ensureSelectionRect, params]
  )

  return { ensureSelectionRect, activateTool }
}
