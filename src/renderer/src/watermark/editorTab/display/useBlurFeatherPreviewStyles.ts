import { useMemo } from 'react'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkToolMode } from '../../watermarkTypes'
import {
  buildCircleFeatherPreviewGeometry,
  buildRectFeatherPreviewGeometry,
  circleFeatherOuterCss,
  innerSelectionBorderCss,
  rectFeatherBandCss,
  rectFeatherOuterCss,
  selectionOverlayCss
} from '../../watermarkBlurFeatherStyles'

/** סטיילים ל־DOM עבור תצוגת feather סביב אזור בחירה. */
export type BlurFeatherPreviewStyles = {
  /** שכבת overlay כהה סביב הבחירה. */
  selectionOverlayStyle: React.CSSProperties | null
  /** מסגרת פנימית של אזור הבחירה (קו דק). */
  innerSelectionBorderStyle: React.CSSProperties | null
  /** רצועת feather לטשטוש (רק rectangle). */
  rectFeatherBandStyle: React.CSSProperties | null
  /** שכבת feather חיצונית (rectangle). */
  rectFeatherOuterStyle: React.CSSProperties | null
  /** שכבת feather חיצונית (circle). */
  circleFeatherOuterStyle: React.CSSProperties | null
}

/** פרמטרים לחישוב גאומטריה וסטיילים של blur-feather בתצוגה. */
export type UseBlurFeatherPreviewStylesParams = {
  /** כלי פעיל (משפיע על האם מציגים feather). */
  activeTool: WatermarkToolMode
  /** צורת בחירה (מלבן/עיגול). */
  selectionShape: WatermarkSelectionShape
  /** מלבן הבחירה ב־DOM. */
  displaySelectionRect: { left: number; top: number; width: number; height: number } | null
  /** רוחב feather ב־DOM (פיקסלים). */
  blurFeatherPreviewPx: number
}

/** מחשב סטיילים להצגת feather (blur) בצורה יעילה וקריאה. */
export function useBlurFeatherPreviewStyles(params: UseBlurFeatherPreviewStylesParams): BlurFeatherPreviewStyles {
  /** מחשב גאומטריה עבור feather עגול. */
  const circleFeatherPreviewGeometry = useMemo(
    () => buildCircleFeatherPreviewGeometry(params.activeTool, params.selectionShape, params.displaySelectionRect, params.blurFeatherPreviewPx),
    [params.activeTool, params.blurFeatherPreviewPx, params.displaySelectionRect, params.selectionShape]
  )

  /** מחשב גאומטריה עבור feather מלבני. */
  const rectFeatherPreviewGeometry = useMemo(
    () => buildRectFeatherPreviewGeometry(params.activeTool, params.selectionShape, params.displaySelectionRect, params.blurFeatherPreviewPx),
    [params.activeTool, params.blurFeatherPreviewPx, params.displaySelectionRect, params.selectionShape]
  )

  /** מפיק CSS לשכבת feather עגולה. */
  const circleFeatherOuterStyle = useMemo(() => circleFeatherOuterCss(circleFeatherPreviewGeometry), [circleFeatherPreviewGeometry])

  /** מפיק CSS לרצועת feather מלבנית. */
  const rectFeatherBandStyle = useMemo(() => rectFeatherBandCss(rectFeatherPreviewGeometry), [rectFeatherPreviewGeometry])

  /** מפיק CSS לשכבת feather חיצונית מלבנית. */
  const rectFeatherOuterStyle = useMemo(() => rectFeatherOuterCss(rectFeatherPreviewGeometry), [rectFeatherPreviewGeometry])

  /** מפיק CSS לשכבת overlay סביב הבחירה. */
  const selectionOverlayStyle = useMemo(
    () => selectionOverlayCss(params.displaySelectionRect, params.activeTool, params.selectionShape),
    [params.activeTool, params.displaySelectionRect, params.selectionShape]
  )

  /** מפיק CSS למסגרת פנימית של הבחירה. */
  const innerSelectionBorderStyle = useMemo(
    () => innerSelectionBorderCss(params.displaySelectionRect, params.activeTool, params.selectionShape),
    [params.activeTool, params.displaySelectionRect, params.selectionShape]
  )

  return {
    selectionOverlayStyle,
    innerSelectionBorderStyle,
    rectFeatherBandStyle,
    rectFeatherOuterStyle,
    circleFeatherOuterStyle
  }
}

