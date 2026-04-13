import { useCallback } from 'react'
import type { WatermarkToolMode } from '../../watermarkTypes'

/** פרמטרים ליצירת handler להקליקת pointer בבמה (Capture). */
export type UseWatermarkStagePointerDownCaptureParams = {
  /** הכלי הפעיל בעורך (רק טקסט משפיע כאן). */
  activeTool: WatermarkToolMode
  /** מאפס טקסט נבחר כשמקליקים מחוץ לשכבת טקסט. */
  setSelectedTextId: (v: string | null) => void
  /** סוגר את מסגרת עריכת הטקסט כשנדרש. */
  setWatermarkTextFrameOpen: (v: boolean) => void
}

/** מחזיר handler שמנקה בחירת טקסט בהקלקה מחוץ לשכבת טקסט. */
export function useWatermarkStagePointerDownCapture(params: UseWatermarkStagePointerDownCaptureParams) {
  /** מנקה בחירת טקסט/מסגרת עריכה רק כשכלי הטקסט פעיל. */
  const onWatermarkStagePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (params.activeTool !== 'text') return
      /** אלמנט ה־DOM שעליו נלחץ ה־pointer. */
      const target = e.target as HTMLElement | null
      if (target?.closest?.('.watermark-text-layer-root')) return
      params.setSelectedTextId(null)
      params.setWatermarkTextFrameOpen(false)
    },
    [params]
  )

  return { onWatermarkStagePointerDownCapture }
}

