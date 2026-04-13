import { useEffect } from 'react'

/** פרמטרים לרישום listeners גלובליים לגרירה. */
export type UseGlobalDragListenersParams = {
  /** callback שמסיים גרירה (לרוב מאפס refs). */
  endDrag: () => void
  /** handlers לגרירות שונות. */
  onMouseMoveHandlers: Array<(e: MouseEvent) => void>
}

/** רושם listeners גלובליים ל־mousemove/mouseup עבור גרירות. */
export function useGlobalDragListeners(params: UseGlobalDragListenersParams) {
  useEffect(() => {
    const onMouseUp = () => params.endDrag()
    for (const h of params.onMouseMoveHandlers) {
      window.addEventListener('mousemove', h)
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      for (const h of params.onMouseMoveHandlers) {
        window.removeEventListener('mousemove', h)
      }
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [params.endDrag, params.onMouseMoveHandlers])
}

