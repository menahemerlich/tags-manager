import { useCallback } from 'react'
import type { WatermarkSelectionRect } from '../../watermarkTypes'
import { getWatermarkTextContentRectInImage } from '../../watermarkTextModel'

/** פרמטרים לחישוב מלבן תוכן “חי” של textarea ביחס לפיקסלי המדיה. */
export type UseLiveTextContentRectInImageParams = {
  baseImageSize: { width: number; height: number } | null
  stageMediaWrapRef: React.RefObject<HTMLDivElement | null>
  textInputRef: React.RefObject<HTMLTextAreaElement | null>
}

/** מחזיר פונקציה שממירה את מלבן התוכן של textarea למסגרת פיקסלים של המדיה. */
export function useLiveTextContentRectInImage(params: UseLiveTextContentRectInImageParams) {
  const getLiveTextContentRectInImage = useCallback(
    (rect: WatermarkSelectionRect): WatermarkSelectionRect => {
      if (!params.baseImageSize) return getWatermarkTextContentRectInImage(rect)
      const wrapEl = params.stageMediaWrapRef.current
      const inputEl = params.textInputRef.current
      if (!wrapEl || !inputEl) return getWatermarkTextContentRectInImage(rect)
      const wrapRect = wrapEl.getBoundingClientRect()
      const taRect = inputEl.getBoundingClientRect()
      if (wrapRect.width <= 0 || wrapRect.height <= 0 || taRect.width <= 0 || taRect.height <= 0) {
        return getWatermarkTextContentRectInImage(rect)
      }
      const cs = window.getComputedStyle(inputEl)
      const padL = Number.parseFloat(cs.paddingLeft || '0') || 0
      const padR = Number.parseFloat(cs.paddingRight || '0') || 0
      const padT = Number.parseFloat(cs.paddingTop || '0') || 0
      const padB = Number.parseFloat(cs.paddingBottom || '0') || 0
      const contentLeft = taRect.left + padL
      const contentTop = taRect.top + padT
      const contentWidth = Math.max(1, taRect.width - padL - padR)
      const contentHeight = Math.max(1, taRect.height - padT - padB)
      const scaleX = params.baseImageSize.width / wrapRect.width
      const scaleY = params.baseImageSize.height / wrapRect.height
      return {
        x: Math.round((contentLeft - wrapRect.left) * scaleX),
        y: Math.round((contentTop - wrapRect.top) * scaleY),
        width: Math.max(1, Math.round(contentWidth * scaleX)),
        height: Math.max(1, Math.round(contentHeight * scaleY))
      }
    },
    [params]
  )

  return { getLiveTextContentRectInImage }
}

