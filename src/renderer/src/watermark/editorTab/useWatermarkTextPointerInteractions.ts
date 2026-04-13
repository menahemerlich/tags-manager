import { useCallback } from 'react'
import type { WatermarkSelectionHandle, WatermarkTextRecord, WatermarkToolMode } from '../watermarkTypes'
import { WATERMARK_TEXT_MOVE_THRESHOLD_PX } from '../watermarkTextModel'

/** תלות חיצונית לגרירות טקסט (שמורה ב־ref במארח). */
export type WatermarkTextDragStateRef = {
  current:
    | {
        textId: string
        mode: WatermarkSelectionHandle | 'rotate'
        startClientX: number
        startClientY: number
        startRect: { x: number; y: number; width: number; height: number }
        fontSizePx: number
        startRotation?: number
        pivotClientX?: number
        pivotClientY?: number
        startPointerAngle?: number
      }
    | null
}

/** פרמטרים לאינטראקציות pointer על טקסט (בחירה/גרירה/פתיחת מסגרת). */
export type UseWatermarkTextPointerInteractionsParams = {
  /** הכלי הפעיל כרגע. */
  activeTool: WatermarkToolMode
  /** מעבר לכלי באופן מבוקר (כולל בדיקות). */
  activateTool: (tool: WatermarkToolMode) => void
  /** פתיחת פאנל כלים בצד. */
  openToolsPanel: () => void
  /** סגירה/פתיחה של מסגרת טקסט מורחבת. */
  setWatermarkTextFrameOpen: (v: boolean) => void
  /** עדכון טקסט נבחר. */
  setSelectedTextId: (id: string | null) => void
  /** הטקסט שנבחר (לגרירה מתוך textarea). */
  selectedText: WatermarkTextRecord | null
  /** ref ל־textarea כדי לטשטש בזמן התחלת גרירה. */
  textInputRef: React.RefObject<HTMLTextAreaElement | null>
  /** ref מצב גרירה משותף. */
  textDragStateRef: WatermarkTextDragStateRef
}

/** יוצר handlers לאינטראקציות pointer על שכבת טקסט. */
export function useWatermarkTextPointerInteractions(params: UseWatermarkTextPointerInteractionsParams) {
  /** מתחיל גרירת טקסט לפי נקודת עכבר וסוג ידית. */
  const startTextDragAt = useCallback(
    (clientX: number, clientY: number, mode: WatermarkSelectionHandle, item: WatermarkTextRecord): void => {
      params.textDragStateRef.current = {
        textId: item.id,
        mode,
        startClientX: clientX,
        startClientY: clientY,
        startRect: { x: item.x, y: item.y, width: item.width, height: item.height },
        fontSizePx: item.style.fontSizePx
      }
    },
    [params.textDragStateRef]
  )

  /** התחלת גרירה מתוך textarea אחרי מעבר סף תנועה. */
  const beginTextInputMoveThreshold = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !params.selectedText) return
      const sx = e.clientX
      const sy = e.clientY
      const threshold2 = WATERMARK_TEXT_MOVE_THRESHOLD_PX * WATERMARK_TEXT_MOVE_THRESHOLD_PX
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        if (dx * dx + dy * dy > threshold2) {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          params.textInputRef.current?.blur()
          const cur = params.selectedText
          if (cur) startTextDragAt(ev.clientX, ev.clientY, 'move', cur)
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [params.selectedText, params.textInputRef, startTextDragAt]
  )

  /** לחיצה על טקסט מכווץ: בוחרת אותו, ובקליק פותחת מסגרת; בגרירה מזיזה. */
  const beginCollapsedTextInteraction = useCallback(
    (e: React.PointerEvent, item: WatermarkTextRecord) => {
      if (e.button !== 0) return
      if (params.activeTool !== 'text') {
        params.activateTool('text')
        params.openToolsPanel()
      }
      params.setSelectedTextId(item.id)
      const sx = e.clientX
      const sy = e.clientY
      let dragged = false
      const threshold2 = WATERMARK_TEXT_MOVE_THRESHOLD_PX * WATERMARK_TEXT_MOVE_THRESHOLD_PX
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        if (dx * dx + dy * dy > threshold2) {
          dragged = true
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          startTextDragAt(ev.clientX, ev.clientY, 'move', item)
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (!dragged) params.setWatermarkTextFrameOpen(true)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [params, startTextDragAt]
  )

  /** לחיצה בתוך מסגרת טקסט מורחבת — מתחילה גרירה (לא על ידיות/textarea). */
  const onTextOverlayPointerDown = useCallback(
    (e: React.PointerEvent, item: WatermarkTextRecord) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (el.closest('button.watermark-crop-handle') || el.closest('.watermark-text-resize-handle')) return
      if (el.closest('.watermark-text-rotate-handle')) return
      if (el.closest('.watermark-text-overlay-textarea')) return
      startTextDragAt(e.clientX, e.clientY, 'move', item)
      e.preventDefault()
      e.stopPropagation()
    },
    [startTextDragAt]
  )

  return {
    startTextDragAt,
    beginTextInputMoveThreshold,
    beginCollapsedTextInteraction,
    onTextOverlayPointerDown
  }
}

