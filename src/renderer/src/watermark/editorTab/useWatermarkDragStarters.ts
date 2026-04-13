import { useCallback } from 'react'
import type { WatermarkSelectionHandle, WatermarkSelectionRect } from '../watermarkTypes'

/** תצורת ref לגרירת סימן מים (מלבן סימן מים). */
export type WatermarkDragStateRef = {
  current:
    | {
        mode: 'move' | 'resize'
        startClientX: number
        startClientY: number
        startRect: WatermarkSelectionRect
      }
    | null
}

/** תצורת ref לגרירת מסגרת בחירה (חיתוך/טשטוש). */
export type WatermarkSelectionDragStateRef = {
  current:
    | {
        mode: WatermarkSelectionHandle
        startClientX: number
        startClientY: number
        startRect: WatermarkSelectionRect
      }
    | null
}

/** פרמטרים להתחלת גרירות בסיסיות בעורך סימן מים. */
export type UseWatermarkDragStartersParams = {
  /** מצב סימן מים נוכחי (כדי להתחיל גרירה רק כשקיים). */
  watermarkRect: WatermarkSelectionRect | null
  /** מצב בחירה נוכחי (כדי להתחיל גרירה רק כשקיים). */
  selectionRect: WatermarkSelectionRect | null
  /** ref לגרירת סימן מים. */
  dragStateRef: WatermarkDragStateRef
  /** ref לגרירת בחירה. */
  selectionDragStateRef: WatermarkSelectionDragStateRef
}

/** יוצר callbacks להתחלת גרירות עבור סימן מים ומסגרת בחירה. */
export function useWatermarkDragStarters(params: UseWatermarkDragStartersParams) {
  /** מתחיל גרירה של סימן מים (move/resize). */
  const startWatermarkDrag = useCallback(
    (event: React.MouseEvent, mode: 'move' | 'resize'): void => {
      if (!params.watermarkRect) return
      event.preventDefault()
      event.stopPropagation()
      params.dragStateRef.current = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: params.watermarkRect
      }
    },
    [params]
  )

  /** מתחיל גרירה של מסגרת בחירה (move/handles). */
  const startSelectionDrag = useCallback(
    (event: React.MouseEvent, mode: WatermarkSelectionHandle): void => {
      if (!params.selectionRect) return
      event.preventDefault()
      event.stopPropagation()
      params.selectionDragStateRef.current = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: params.selectionRect
      }
    },
    [params]
  )

  return { startWatermarkDrag, startSelectionDrag }
}

