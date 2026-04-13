import { useCallback } from 'react'
import type { WatermarkSelectionHandle, WatermarkTextRecord } from '../../watermarkTypes'
import type { WatermarkTextDragStateRef } from '../useWatermarkTextPointerInteractions'

/** פרמטרים ליצירת callbacks להתחלת גרירה/סיבוב של שכבת טקסט. */
export type UseTextDragStartersParams = {
  /** ref של מצב גרירת טקסט (משותף ל־mousemove). */
  textDragStateRef: WatermarkTextDragStateRef
  /** עטיפה של המדיה על הבמה (לחישוב pivot בסיבוב). */
  stageMediaWrapRect: DOMRect | null
  /** גודל המדיה בפיקסלים. */
  baseImageSize: { width: number; height: number } | null
  /** גודל הבמה בפיקסלים (DOM). */
  stageSize: { width: number; height: number }
}

/** יוצר handlers להתחלת גרירה/סיבוב עבור שכבת טקסט. */
export function useTextDragStarters(params: UseTextDragStartersParams) {
  /** מתחיל גרירה (move/resize) עבור טקסט. */
  const startTextDrag = useCallback(
    (event: React.MouseEvent, mode: WatermarkSelectionHandle, item: WatermarkTextRecord): void => {
      event.preventDefault()
      event.stopPropagation()
      params.textDragStateRef.current = {
        textId: item.id,
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: { x: item.x, y: item.y, width: item.width, height: item.height },
        fontSizePx: item.style.fontSizePx
      }
    },
    [params]
  )

  /** מתחיל סיבוב טקסט לפי זווית pointer סביב מרכז התיבה. */
  const startTextRotateDrag = useCallback(
    (event: React.MouseEvent, item: WatermarkTextRecord): void => {
      event.preventDefault()
      event.stopPropagation()
      const wrap = params.stageMediaWrapRect
      if (!wrap || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return

      const sx = params.stageSize.width / params.baseImageSize.width
      const sy = params.stageSize.height / params.baseImageSize.height
      const cxStage = (item.x + item.width / 2) * sx
      const cyStage = (item.y + item.height / 2) * sy
      const pivotClientX = wrap.left + cxStage
      const pivotClientY = wrap.top + cyStage
      const startPointerAngle = Math.atan2(event.clientY - pivotClientY, event.clientX - pivotClientX)

      params.textDragStateRef.current = {
        textId: item.id,
        mode: 'rotate',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: { x: item.x, y: item.y, width: item.width, height: item.height },
        fontSizePx: item.style.fontSizePx,
        startRotation: item.rotation ?? 0,
        pivotClientX,
        pivotClientY,
        startPointerAngle
      }
    },
    [params]
  )

  return { startTextDrag, startTextRotateDrag }
}

