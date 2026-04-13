import { useCallback } from 'react'
import { clampNumber } from '../../watermarkHelpers'
import { clampWatermarkIntoBounds } from '../../watermarkPlacement'
import type { WatermarkSelectionHandle, WatermarkSelectionRect, WatermarkToolMode } from '../../watermarkTypes'

/** מצב גרירה של מסגרת בחירה (חיתוך/טשטוש). */
export type SelectionRectDragState = {
  mode: WatermarkSelectionHandle
  startClientX: number
  startClientY: number
  startRect: WatermarkSelectionRect
}

/** פרמטרים לגרירת מסגרת בחירה. */
export type UseSelectionRectDragMouseMoveParams = {
  selectionDragStateRef: { current: SelectionRectDragState | null }
  baseImageSize: { width: number; height: number } | null
  stageSize: { width: number; height: number }
  selectionRect: WatermarkSelectionRect | null
  activeTool: WatermarkToolMode
  setSelectionRect: (v: WatermarkSelectionRect) => void
  setWatermarkRect: (fn: (prev: WatermarkSelectionRect | null) => WatermarkSelectionRect | null) => void
}

/** יוצר handler ל־mousemove עבור גרירת מסגרת בחירה. */
export function useSelectionRectDragMouseMove(params: UseSelectionRectDragMouseMoveParams) {
  const handleGlobalSelectionMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = params.selectionDragStateRef.current
      if (!drag || !params.baseImageSize || !params.selectionRect || params.stageSize.width <= 0 || params.stageSize.height <= 0) return

      const scaleX = params.baseImageSize.width / params.stageSize.width
      const scaleY = params.baseImageSize.height / params.stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        const nextSelection = {
          ...drag.startRect,
          x: Math.round(clampNumber(drag.startRect.x + deltaX, 0, Math.max(0, params.baseImageSize.width - width))),
          y: Math.round(clampNumber(drag.startRect.y + deltaY, 0, Math.max(0, params.baseImageSize.height - height)))
        }
        params.setSelectionRect(nextSelection)
        if (params.activeTool === 'crop') {
          params.setWatermarkRect((prev) => (prev ? clampWatermarkIntoBounds(prev, params.baseImageSize!, nextSelection) : prev))
        }
        return
      }

      let nextX = drag.startRect.x
      let nextY = drag.startRect.y
      let nextWidth = drag.startRect.width
      let nextHeight = drag.startRect.height

      if (drag.mode.includes('e')) {
        nextWidth = clampNumber(drag.startRect.width + deltaX, 80, Math.max(80, params.baseImageSize.width - drag.startRect.x))
      }
      if (drag.mode.includes('s')) {
        nextHeight = clampNumber(drag.startRect.height + deltaY, 80, Math.max(80, params.baseImageSize.height - drag.startRect.y))
      }
      if (drag.mode.includes('w')) {
        const proposedX = clampNumber(drag.startRect.x + deltaX, 0, drag.startRect.x + drag.startRect.width - 80)
        nextWidth = drag.startRect.width - (proposedX - drag.startRect.x)
        nextX = proposedX
      }
      if (drag.mode.includes('n')) {
        const proposedY = clampNumber(drag.startRect.y + deltaY, 0, drag.startRect.y + drag.startRect.height - 80)
        nextHeight = drag.startRect.height - (proposedY - drag.startRect.y)
        nextY = proposedY
      }

      const nextSelection = {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight)
      }
      params.setSelectionRect(nextSelection)
      if (params.activeTool === 'crop') {
        params.setWatermarkRect((prev) => (prev ? clampWatermarkIntoBounds(prev, params.baseImageSize!, nextSelection) : prev))
      }
    },
    [params]
  )

  return { handleGlobalSelectionMouseMove }
}

