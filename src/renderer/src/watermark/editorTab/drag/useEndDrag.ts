import { useCallback } from 'react'

/** ref כללי לגרירת סימן מים/בחירה/טקסט, כדי לאפס בסיום. */
export type WatermarkAnyDragRefs = {
  dragStateRef: { current: unknown | null }
  selectionDragStateRef: { current: unknown | null }
  textDragStateRef: { current: unknown | null }
}

/** יוצר callback אחיד לסיום כל גרירה בעורך. */
export function useEndDrag(refs: WatermarkAnyDragRefs) {
  /** מאפס את כל refs של מצב גרירה פעיל. */
  const endDrag = useCallback(() => {
    refs.dragStateRef.current = null
    refs.selectionDragStateRef.current = null
    refs.textDragStateRef.current = null
  }, [refs])

  return { endDrag }
}

