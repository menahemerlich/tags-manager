import { useMemo } from 'react'
import { renderWatermarkTextLayerDataUrl } from '../../watermarkTextCanvas'
import { getWatermarkTextContentRectInImage, WATERMARK_TEXT_FONT_SIZE_MIN } from '../../watermarkTextModel'
import type { WatermarkSelectionRect, WatermarkTextRecord } from '../../watermarkTypes'

/** תוצאת חישובי תצוגה/תצוגה מקדימה לשכבות טקסט. */
export type WatermarkTextDisplayState = {
  /** סדר רינדור (מבטיח שהטקסט הפתוח נמצא מעל). */
  textItemsRenderOrder: WatermarkTextRecord[]
  /** URLים של תצוגות טקסט מכווצות (לשיפור ביצועים). */
  collapsedTextPreviewUrls: Map<string, string>
  /** מלבן הטקסט הנבחר ביחידות DOM. */
  displayTextRect: { left: number; top: number; width: number; height: number } | null
  /** מלבן התוכן הפנימי (textarea) ביחידות DOM, יחסית למסגרת. */
  displayTextContentRect: { x: number; y: number; width: number; height: number } | null
  /** Data URL לתצוגה מקדימה של שכבת הטקסט (רסטר). */
  previewTextLayerDataUrl: string
}

/** פרמטרים לחישובי תצוגה של טקסט בבמה. */
export type UseWatermarkTextDisplayParams = {
  baseImageSize: { width: number; height: number } | null
  stageSize: { width: number; height: number }
  textItems: WatermarkTextRecord[]
  selectedTextId: string | null
  watermarkTextFrameOpen: boolean
  selectedText: WatermarkTextRecord | null
  liveTextContentRectInImage: WatermarkSelectionRect | null
}

/** מחשב נתוני תצוגה לטקסט (סדר שכבות, previewים, ורקטים ל־DOM). */
export function useWatermarkTextDisplay(params: UseWatermarkTextDisplayParams): WatermarkTextDisplayState {
  /** מחשב סדר רינדור שממקם את הטקסט הפתוח למעלה. */
  const textItemsRenderOrder = useMemo(() => {
    /** מזהה שכבת הטקסט הפתוחה (אם יש), כדי לשים אותה מעל השאר. */
    const openId = params.selectedTextId && params.watermarkTextFrameOpen ? params.selectedTextId : null
    if (!openId) return params.textItems
    return [...params.textItems].sort((a, b) => {
      if (a.id === openId) return 1
      if (b.id === openId) return -1
      return 0
    })
  }, [params.textItems, params.selectedTextId, params.watermarkTextFrameOpen])

  /** יוצר מפה של URLים לטקסטים מכווצים כדי להימנע מרינדור קנבס בכל פריים. */
  const collapsedTextPreviewUrls = useMemo(() => {
    /** מפה שמחזיקה תצוגות רסטר מוכנות לפי מזהה טקסט. */
    const m = new Map<string, string>()
    if (!params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return m
    /** סקייל אחיד לתצוגה (הקטנה/הגדלה) לצורך התאמת font-size בפריוויו. */
    const previewScale = Math.min(params.stageSize.width / params.baseImageSize.width, params.stageSize.height / params.baseImageSize.height)
    /** יחס סקייל אופקי בין מדיה ל־DOM. */
    const scaleX = params.stageSize.width / params.baseImageSize.width
    /** יחס סקייל אנכי בין מדיה ל־DOM. */
    const scaleY = params.stageSize.height / params.baseImageSize.height
    for (const item of params.textItems) {
      if (item.id === params.selectedTextId && params.watermarkTextFrameOpen) continue
      /** מלבן תוכן הטקסט ביחידות מדיה. */
      const cr = getWatermarkTextContentRectInImage(item)
      /** רוחב התוכן ביחידות DOM. */
      const relW = cr.width * scaleX
      /** גובה התוכן ביחידות DOM. */
      const relH = cr.height * scaleY
      try {
        /** Data URL של שכבת טקסט רסטרית (לרינדור מהיר). */
        const url = renderWatermarkTextLayerDataUrl(item.content, relW, relH, {
          ...item.style,
          fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, item.style.fontSizePx * previewScale)
        })
        m.set(item.id, url)
      } catch {
        // skip
      }
    }
    return m
  }, [
    params.baseImageSize,
    params.stageSize.height,
    params.stageSize.width,
    params.textItems,
    params.selectedTextId,
    params.watermarkTextFrameOpen
  ])

  /** מחשב את מלבן הטקסט הנבחר ביחידות DOM. */
  const displayTextRect = useMemo(() => {
    if (!params.selectedText || !params.baseImageSize || params.stageSize.width <= 0 || params.stageSize.height <= 0) return null
    /** יחס סקייל אופקי בין מדיה ל־DOM. */
    const scaleX = params.stageSize.width / params.baseImageSize.width
    /** יחס סקייל אנכי בין מדיה ל־DOM. */
    const scaleY = params.stageSize.height / params.baseImageSize.height
    return {
      left: params.selectedText.x * scaleX,
      top: params.selectedText.y * scaleY,
      width: params.selectedText.width * scaleX,
      height: params.selectedText.height * scaleY
    }
  }, [params.baseImageSize, params.stageSize.height, params.stageSize.width, params.selectedText])

  /** מחשב את מלבן התוכן הפנימי (textarea) ביחידות DOM, יחסית למסגרת. */
  const displayTextContentRect = useMemo(() => {
    if (!displayTextRect || !params.selectedText) return null
    if (params.liveTextContentRectInImage && params.baseImageSize && params.stageSize.width > 0 && params.stageSize.height > 0) {
      /** יחס סקייל אופקי בין מדיה ל־DOM. */
      const scaleX = params.stageSize.width / params.baseImageSize.width
      /** יחס סקייל אנכי בין מדיה ל־DOM. */
      const scaleY = params.stageSize.height / params.baseImageSize.height
      return {
        x: params.liveTextContentRectInImage.x * scaleX - displayTextRect.left,
        y: params.liveTextContentRectInImage.y * scaleY - displayTextRect.top,
        width: params.liveTextContentRectInImage.width * scaleX,
        height: params.liveTextContentRectInImage.height * scaleY
      }
    }
    return getWatermarkTextContentRectInImage({
      x: 0,
      y: 0,
      width: displayTextRect.width,
      height: displayTextRect.height
    })
  }, [params.baseImageSize, displayTextRect, params.liveTextContentRectInImage, params.selectedText, params.stageSize.height, params.stageSize.width])

  /** יוצר שכבת preview רסטרית למסגרת טקסט פתוחה. */
  const previewTextLayerDataUrl = useMemo(() => {
    if (!displayTextRect || !displayTextContentRect || !params.selectedText || !params.baseImageSize || !params.watermarkTextFrameOpen) return ''
    try {
      /** סקייל אחיד לתצוגה לצורך התאמת font-size בפריוויו. */
      const previewScale = Math.min(params.stageSize.width / params.baseImageSize.width, params.stageSize.height / params.baseImageSize.height)
      return renderWatermarkTextLayerDataUrl(params.selectedText.content, displayTextContentRect.width, displayTextContentRect.height, {
        ...params.selectedText.style,
        fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, params.selectedText.style.fontSizePx * previewScale)
      })
    } catch {
      return ''
    }
  }, [
    params.baseImageSize,
    displayTextContentRect,
    displayTextRect,
    params.selectedText,
    params.stageSize.height,
    params.stageSize.width,
    params.watermarkTextFrameOpen
  ])

  return {
    textItemsRenderOrder,
    collapsedTextPreviewUrls,
    displayTextRect,
    displayTextContentRect,
    previewTextLayerDataUrl
  }
}

