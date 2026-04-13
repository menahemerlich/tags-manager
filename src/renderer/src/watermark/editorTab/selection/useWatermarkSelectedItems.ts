import { useEffect, useMemo } from 'react'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import type { WatermarkTextRecord } from '../../watermarkTypes'

/** פרמטרים לחישוב פריטים נבחרים ולניקוי בחירה כשפריט נמחק. */
export type UseWatermarkSelectedItemsParams = {
  /** רשימת שכבות טקסט. */
  textItems: WatermarkTextRecord[]
  /** מזהה טקסט נבחר. */
  selectedTextId: string | null
  /** setter למזהה טקסט נבחר. */
  setSelectedTextId: (updater: (prev: string | null) => string | null) => void
  /** רשימת שכבות צורות. */
  shapeItems: WatermarkShapeRecord[]
  /** מזהה צורה נבחרת. */
  selectedShapeId: string | null
  /** setter למזהה צורה נבחרת. */
  setSelectedShapeId: (updater: (prev: string | null) => string | null) => void
}

/** תוצאת בחירה: הרשומה הנבחרת (אם קיימת) לכל סוג. */
export type WatermarkSelectedItemsState = {
  /** שכבת טקסט נבחרת (או null). */
  selectedText: WatermarkTextRecord | null
  /** שכבת צורה נבחרת (או null). */
  selectedShape: WatermarkShapeRecord | null
}

/** מרכז חישוב פריטים נבחרים + ניקוי מזהים כשהפריט כבר לא קיים. */
export function useWatermarkSelectedItems(params: UseWatermarkSelectedItemsParams): WatermarkSelectedItemsState {
  /** מחזיר את שכבת הטקסט הנבחרת לפי מזהה. */
  const selectedText = useMemo(
    () => params.textItems.find((t) => t.id === params.selectedTextId) ?? null,
    [params.textItems, params.selectedTextId]
  )

  /** מאפס בחירת טקסט אם המזהה לא קיים יותר ברשימה. */
  useEffect(() => {
    params.setSelectedTextId((cur) => (cur && params.textItems.some((t) => t.id === cur) ? cur : null))
  }, [params])

  /** מחזיר את שכבת הצורה הנבחרת לפי מזהה. */
  const selectedShape = useMemo(
    () => params.shapeItems.find((s) => s.id === params.selectedShapeId) ?? null,
    [params.shapeItems, params.selectedShapeId]
  )

  /** מאפס בחירת צורה אם המזהה לא קיים יותר ברשימה. */
  useEffect(() => {
    params.setSelectedShapeId((cur) => (cur && params.shapeItems.some((s) => s.id === cur) ? cur : null))
  }, [params])

  return { selectedText, selectedShape }
}

