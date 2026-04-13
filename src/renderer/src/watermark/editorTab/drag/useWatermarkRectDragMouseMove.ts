import { useCallback } from 'react'
import { clampNumber } from '../../watermarkHelpers'
import { clampWatermarkIntoBounds, getPlacementBounds } from '../../watermarkPlacement'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** מצב גרירה של סימן מים (מלבן סימן מים). */
export type WatermarkRectDragState = {
  mode: 'move' | 'resize'
  startClientX: number
  startClientY: number
  startRect: WatermarkSelectionRect
}

/** פרמטרים לגרירה של סימן מים. */
export type UseWatermarkRectDragMouseMoveParams = {
  /** ref למצב גרירה. */
  dragStateRef: { current: WatermarkRectDragState | null }
  /** גודל המדיה. */
  baseImageSize: { width: number; height: number } | null
  /** גודל הבמה הנוכחי. */
  stageSize: { width: number; height: number }
  /** גבולות מיקום (למשל crop). */
  currentWatermarkBounds: WatermarkSelectionRect | null
  /** יחס סימן מים. */
  watermarkAspectRatio: number
  /** מצב סימן מים נוכחי (ל-resize). */
  watermarkRect: WatermarkSelectionRect | null
  /** setter למלבן סימן מים. */
  setWatermarkRect: (v: WatermarkSelectionRect) => void
}

/** יוצר handler ל־mousemove עבור גרירת סימן מים (move/resize). */
export function useWatermarkRectDragMouseMove(params: UseWatermarkRectDragMouseMoveParams) {
  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = params.dragStateRef.current
      if (!drag || !params.baseImageSize || !params.watermarkRect || params.stageSize.width <= 0 || params.stageSize.height <= 0) return

      const scaleX = params.baseImageSize.width / params.stageSize.width
      const scaleY = params.baseImageSize.height / params.stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY
      const bounds = getPlacementBounds(params.baseImageSize, params.currentWatermarkBounds)

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        params.setWatermarkRect({
          ...drag.startRect,
          x: Math.round(clampNumber(drag.startRect.x + deltaX, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
          y: Math.round(clampNumber(drag.startRect.y + deltaY, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
        })
        return
      }

      const ratio =
        params.watermarkAspectRatio > 0 ? params.watermarkAspectRatio : drag.startRect.width / Math.max(1, drag.startRect.height)
      const widthDelta = Math.max(deltaX, deltaY * ratio)
      let nextWidth = clampNumber(drag.startRect.width + widthDelta, 40, Math.max(40, bounds.x + bounds.width - drag.startRect.x))
      let nextHeight = nextWidth / ratio
      if (drag.startRect.y + nextHeight > bounds.y + bounds.height) {
        nextHeight = bounds.y + bounds.height - drag.startRect.y
        nextWidth = nextHeight * ratio
      }
      params.setWatermarkRect({
        ...drag.startRect,
        width: Math.round(Math.max(40, nextWidth)),
        height: Math.round(Math.max(40, nextHeight))
      })
    },
    [params]
  )

  return { handleGlobalMouseMove }
}

