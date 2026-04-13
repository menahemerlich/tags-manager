import { useEffect, type MutableRefObject } from 'react'
import { createWatermarkEditorSnapshot, type WatermarkEditorSnapshot } from '../../watermarkEditorSession'
import type { WatermarkLayerEntry } from '../../watermarkLayerOrder'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord } from '../../watermarkTypes'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import type { WatermarkInitialSessionBaseline } from './watermarkSessionMedia'

/** פרמטרים לצילום baseline ראשוני של וידאו. */
export type UseInitialVideoSessionBaselineCaptureParams = {
  /** נתיב המדיה הבסיסית. */
  baseImagePath: string | null
  /** האם המדיה הנוכחית היא וידאו. */
  baseIsVideo: boolean
  /** מידות המדיה הבסיסית. */
  baseImageSize: { width: number; height: number } | null
  /** URL לוידאו. */
  baseVideoUrl: string | null
  /** משך וידאו. */
  videoDurationSec: number
  /** ref לנתיב שכבר צולם לו baseline. */
  initialBaselineCapturedForPathRef: MutableRefObject<string | null>
  /** ref לבייסליין הראשוני של הסשן. */
  initialSessionBaselineRef: MutableRefObject<WatermarkInitialSessionBaseline | null>

  /** מצב עורך לצילום snapshot. */
  selectionRect: WatermarkSelectionRect | null
  selectionShape: WatermarkSelectionShape
  blurStrength: number
  blurFeather: number
  focusSeparation: number
  layerOrder: WatermarkLayerEntry[]
  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
  watermarkRect: WatermarkSelectionRect | null
  watermarkOpacity: number
  watermarkAspectRatio: number
  watermarkImagePath: string | null
  clipStartSec: number
  clipEndSec: number
}

/** מצלם baseline ראשוני עבור וידאו ברגע שיש מטא־דאטה (מידות/משך) ומונע צילום כפול. */
export function useInitialVideoSessionBaselineCapture(params: UseInitialVideoSessionBaselineCaptureParams): void {
  useEffect(() => {
    if (!params.baseImagePath || !params.baseIsVideo || !params.baseImageSize || !params.baseVideoUrl) return
    if (params.videoDurationSec <= 0) return
    if (params.initialBaselineCapturedForPathRef.current === params.baseImagePath) return

    /** מסמן שה־baseline צולם עבור הנתיב הנוכחי. */
    params.initialBaselineCapturedForPathRef.current = params.baseImagePath

    /** snapshot מצב עורך בנקודת baseline. */
    const snapshot = createWatermarkEditorSnapshot({
      selectionRect: params.selectionRect,
      selectionShape: params.selectionShape,
      blurStrength: params.blurStrength,
      blurFeather: params.blurFeather,
      focusSeparation: params.focusSeparation,
      layerOrder: params.layerOrder,
      textItems: params.textItems,
      shapeItems: params.shapeItems,
      watermarkRect: params.watermarkRect,
      watermarkOpacity: params.watermarkOpacity,
      watermarkAspectRatio: params.watermarkAspectRatio,
      watermarkImagePath: params.watermarkImagePath,
      clipStartSec: params.clipStartSec,
      clipEndSec: params.clipEndSec
    })

    params.initialSessionBaselineRef.current = {
      snapshot,
      media: {
        baseImagePath: params.baseImagePath,
        baseImageSrc: null,
        baseImageSize: params.baseImageSize,
        baseImagePixelsFromBake: false,
        baseVideoUrl: params.baseVideoUrl,
        videoDurationSec: params.videoDurationSec
      }
    }
  }, [
    params.baseImagePath,
    params.baseImageSize,
    params.baseIsVideo,
    params.baseVideoUrl,
    params.blurFeather,
    params.blurStrength,
    params.clipEndSec,
    params.clipStartSec,
    params.focusSeparation,
    params.initialBaselineCapturedForPathRef,
    params.initialSessionBaselineRef,
    params.layerOrder,
    params.selectionRect,
    params.selectionShape,
    params.shapeItems,
    params.textItems,
    params.videoDurationSec,
    params.watermarkAspectRatio,
    params.watermarkImagePath,
    params.watermarkOpacity,
    params.watermarkRect
  ])
}

