import { useCallback, useMemo } from 'react'
import type { WatermarkLayerEntry } from '../../watermarkLayerOrder'
import { layerIndexInStack, moveLayerBackward, moveLayerForward } from '../../watermarkLayerOrder'

/** תוצאת חישוב סטטוס שכבות (stack) ופעולות שינוי סדר. */
export type WatermarkLayerStackControls = {
  /** האם ניתן להזיז את הטקסט הנבחר קדימה (למעלה בערימה). */
  canTextStackForward: boolean
  /** האם ניתן להזיז את הטקסט הנבחר אחורה (למטה בערימה). */
  canTextStackBackward: boolean
  /** האם ניתן להזיז את הצורה הנבחרת קדימה (למעלה בערימה). */
  canShapeStackForward: boolean
  /** האם ניתן להזיז את הצורה הנבחרת אחורה (למטה בערימה). */
  canShapeStackBackward: boolean
  /** מזיז שכבת טקסט נבחרת קדימה בערימה. */
  moveTextLayerForward: () => void
  /** מזיז שכבת טקסט נבחרת אחורה בערימה. */
  moveTextLayerBackward: () => void
  /** מזיז שכבת צורה נבחרת קדימה בערימה. */
  moveShapeLayerForward: () => void
  /** מזיז שכבת צורה נבחרת אחורה בערימה. */
  moveShapeLayerBackward: () => void
}

/** פרמטרים לחישוב סטטוס ופעולות של ערימת שכבות. */
export type UseWatermarkLayerStackControlsParams = {
  /** סדר שכבות משולב (טקסט + צורות). */
  layerOrder: WatermarkLayerEntry[]
  /** מזהה טקסט נבחר (אם קיים). */
  selectedTextId: string | null
  /** מזהה צורה נבחרת (אם קיים). */
  selectedShapeId: string | null
  /** setter לסדר שכבות. */
  setLayerOrder: (updater: (prev: WatermarkLayerEntry[]) => WatermarkLayerEntry[]) => void
}

/** מרכז חישובי אינדקסים ופעולות קדימה/אחורה עבור שכבות טקסט וצורות. */
export function useWatermarkLayerStackControls(params: UseWatermarkLayerStackControlsParams): WatermarkLayerStackControls {
  /** אינדקס הטקסט הנבחר בערימה (או -1 אם אין). */
  const textStackIndex = useMemo(
    () => (params.selectedTextId ? layerIndexInStack(params.layerOrder, 'text', params.selectedTextId) : -1),
    [params.layerOrder, params.selectedTextId]
  )

  /** אינדקס הצורה הנבחרת בערימה (או -1 אם אין). */
  const shapeStackIndex = useMemo(
    () => (params.selectedShapeId ? layerIndexInStack(params.layerOrder, 'shape', params.selectedShapeId) : -1),
    [params.layerOrder, params.selectedShapeId]
  )

  /** האם ניתן להזיז טקסט קדימה/אחורה לפי מיקום בערימה. */
  const canTextStackForward = textStackIndex >= 0 && textStackIndex < params.layerOrder.length - 1
  const canTextStackBackward = textStackIndex > 0

  /** האם ניתן להזיז צורה קדימה/אחורה לפי מיקום בערימה. */
  const canShapeStackForward = shapeStackIndex >= 0 && shapeStackIndex < params.layerOrder.length - 1
  const canShapeStackBackward = shapeStackIndex > 0

  /** מזיז את שכבת הטקסט הנבחרת קדימה. */
  const moveTextLayerForward = useCallback(() => {
    /** מזהה הטקסט הנבחר בזמן ההרצה (מבטיח טיפוס string). */
    const id = params.selectedTextId
    if (!id) return
    params.setLayerOrder((o) => moveLayerForward(o, 'text', id))
  }, [params])

  /** מזיז את שכבת הטקסט הנבחרת אחורה. */
  const moveTextLayerBackward = useCallback(() => {
    /** מזהה הטקסט הנבחר בזמן ההרצה (מבטיח טיפוס string). */
    const id = params.selectedTextId
    if (!id) return
    params.setLayerOrder((o) => moveLayerBackward(o, 'text', id))
  }, [params])

  /** מזיז את שכבת הצורה הנבחרת קדימה. */
  const moveShapeLayerForward = useCallback(() => {
    /** מזהה הצורה הנבחרת בזמן ההרצה (מבטיח טיפוס string). */
    const id = params.selectedShapeId
    if (!id) return
    params.setLayerOrder((o) => moveLayerForward(o, 'shape', id))
  }, [params])

  /** מזיז את שכבת הצורה הנבחרת אחורה. */
  const moveShapeLayerBackward = useCallback(() => {
    /** מזהה הצורה הנבחרת בזמן ההרצה (מבטיח טיפוס string). */
    const id = params.selectedShapeId
    if (!id) return
    params.setLayerOrder((o) => moveLayerBackward(o, 'shape', id))
  }, [params])

  return {
    canTextStackForward,
    canTextStackBackward,
    canShapeStackForward,
    canShapeStackBackward,
    moveTextLayerForward,
    moveTextLayerBackward,
    moveShapeLayerForward,
    moveShapeLayerBackward
  }
}

