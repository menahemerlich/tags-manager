import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { WatermarkExportOverlayState, WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from '../watermarkTypes'
import type { WatermarkShapeRecord } from '../watermarkShapeModel'
import { runWatermarkExport } from '../watermarkEditorExport'
import type { BlurPreviewSource } from '../../blurProcessor'

/** פרמטרים להפעלת פעולת ייצוא ראשית של עורך סימן מים. */
export type UseWatermarkExportMainParams = {
  watermarkExportInFlightRef: MutableRefObject<boolean>
  blurPreviewSourceRef: MutableRefObject<BlurPreviewSource | null>
  baseImagePath: string | null
  watermarkImagePath: string | null
  watermarkRect: WatermarkSelectionRect | null
  baseIsVideo: boolean
  baseImageSize: { width: number; height: number } | null
  videoDurationSec: number
  clipStartSec: number
  clipEndSec: number
  activeTool: WatermarkToolMode
  selectionRect: WatermarkSelectionRect | null
  selectionShape: WatermarkSelectionShape
  blurStrength: number
  blurFeather: number
  focusSeparation: number
  watermarkOpacity: number
  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
  selectedTextId: string | null
  liveTextContentRectInImage: WatermarkSelectionRect | null
  previewBaseImageDataUrl: string | null
  setEditorError: (v: string | null) => void
  setExportMsg: (v: string | null) => void
  setIsExporting: (v: boolean) => void
  setExportOverlay: Dispatch<SetStateAction<WatermarkExportOverlayState>>
}

/** מחזיר פעולה שמפעילה את מסלול הייצוא המשותף (תמונה/וידאו) עם progress overlay. */
export function useWatermarkExportMain(params: UseWatermarkExportMainParams) {
  /** מפעיל את מסלול הייצוא (תמונה/וידאו) עם overlay והודעות סטטוס. */
  const exportMain = useCallback(async (): Promise<void> => {
    await runWatermarkExport({
      watermarkExportInFlightRef: params.watermarkExportInFlightRef,
      blurPreviewSourceRef: params.blurPreviewSourceRef,
      baseImagePath: params.baseImagePath,
      watermarkImagePath: params.watermarkImagePath,
      watermarkRect: params.watermarkRect,
      baseIsVideo: params.baseIsVideo,
      baseImageSize: params.baseImageSize,
      videoDurationSec: params.videoDurationSec,
      clipStartSec: params.clipStartSec,
      clipEndSec: params.clipEndSec,
      activeTool: params.activeTool,
      selectionRect: params.selectionRect,
      selectionShape: params.selectionShape,
      blurStrength: params.blurStrength,
      blurFeather: params.blurFeather,
      focusSeparation: params.focusSeparation,
      watermarkOpacity: params.watermarkOpacity,
      textItems: params.textItems,
      shapeItems: params.shapeItems,
      selectedTextId: params.selectedTextId,
      liveTextContentRectInImage: params.liveTextContentRectInImage,
      previewBaseImageDataUrl: params.previewBaseImageDataUrl,
      setEditorError: params.setEditorError,
      setExportMsg: params.setExportMsg,
      setIsExporting: params.setIsExporting,
      setExportOverlay: params.setExportOverlay
    })
  }, [params])

  return { exportMain }
}

