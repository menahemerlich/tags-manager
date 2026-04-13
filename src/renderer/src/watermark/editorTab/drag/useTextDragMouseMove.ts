import { useCallback } from 'react'
import { clampNumber } from '../../watermarkHelpers'
import { clampWatermarkIntoBounds, getPlacementBounds } from '../../watermarkPlacement'
import { WATERMARK_TEXT_RECT_MIN_H, WATERMARK_TEXT_RECT_MIN_W, type WatermarkSelectionHandle, type WatermarkSelectionRect, type WatermarkTextRecord } from '../../watermarkTypes'

/** מצב גרירה של טקסט (move/resize/rotate). */
export type TextDragState = {
  textId: string
  mode: WatermarkSelectionHandle | 'rotate'
  startClientX: number
  startClientY: number
  startRect: WatermarkSelectionRect
  fontSizePx: number
  startRotation?: number
  pivotClientX?: number
  pivotClientY?: number
  startPointerAngle?: number
}

/** פרמטרים ל־mousemove של טקסט. */
export type UseTextDragMouseMoveParams = {
  textDragStateRef: { current: TextDragState | null }
  baseImageSize: { width: number; height: number } | null
  stageSize: { width: number; height: number }
  currentWatermarkBounds: WatermarkSelectionRect | null
  setTextItems: (fn: (prev: WatermarkTextRecord[]) => WatermarkTextRecord[]) => void
}

/** יוצר handler ל־mousemove עבור גרירת טקסט (move/resize/rotate). */
export function useTextDragMouseMove(params: UseTextDragMouseMoveParams) {
  const handleGlobalTextMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = params.textDragStateRef.current
      if (!drag || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return

      const scaleX = params.baseImageSize.width / params.stageSize.width
      const scaleY = params.baseImageSize.height / params.stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY
      const bounds = getPlacementBounds(params.baseImageSize, params.currentWatermarkBounds)

      const applyRect = (next: WatermarkSelectionRect) => {
        params.setTextItems((items) =>
          items.map((it) =>
            it.id === drag.textId ? { ...it, ...clampWatermarkIntoBounds(next, params.baseImageSize!, params.currentWatermarkBounds) } : it
          )
        )
      }

      if (drag.mode === 'rotate') {
        const pvx = drag.pivotClientX!
        const pvy = drag.pivotClientY!
        const a1 = Math.atan2(event.clientY - pvy, event.clientX - pvx)
        const deltaDeg = ((a1 - drag.startPointerAngle!) * 180) / Math.PI
        const nextRot = drag.startRotation! + deltaDeg
        params.setTextItems((items) => items.map((it) => (it.id === drag.textId ? { ...it, rotation: nextRot } : it)))
        return
      }

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        applyRect({
          ...drag.startRect,
          x: Math.round(clampNumber(drag.startRect.x + deltaX, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
          y: Math.round(clampNumber(drag.startRect.y + deltaY, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
        })
        return
      }

      const minW = WATERMARK_TEXT_RECT_MIN_W
      const minH = WATERMARK_TEXT_RECT_MIN_H
      let nextX = drag.startRect.x
      let nextY = drag.startRect.y
      let nextWidth = drag.startRect.width
      let nextHeight = drag.startRect.height

      if (drag.mode.includes('e')) {
        nextWidth = clampNumber(drag.startRect.width + deltaX, minW, Math.max(minW, bounds.x + bounds.width - drag.startRect.x))
      }
      if (drag.mode.includes('s')) {
        nextHeight = clampNumber(drag.startRect.height + deltaY, minH, Math.max(minH, bounds.y + bounds.height - drag.startRect.y))
      }
      if (drag.mode.includes('w')) {
        const proposedX = clampNumber(drag.startRect.x + deltaX, bounds.x, drag.startRect.x + drag.startRect.width - minW)
        nextWidth = drag.startRect.width - (proposedX - drag.startRect.x)
        nextX = proposedX
      }
      if (drag.mode.includes('n')) {
        const proposedY = clampNumber(drag.startRect.y + deltaY, bounds.y, drag.startRect.y + drag.startRect.height - minH)
        nextHeight = drag.startRect.height - (proposedY - drag.startRect.y)
        nextY = proposedY
      }

      applyRect({
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight)
      })
    },
    [params]
  )

  return { handleGlobalTextMouseMove }
}

