import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { BlurPreviewSource } from '../blurProcessor'
import { exportWatermarkShapesToOverlays } from './watermarkShapesExport'
import { type WatermarkShapeRecord } from './watermarkShapeModel'
import { getWatermarkTextContentRectInImage } from './watermarkTextModel'
import { rasterizeWatermarkTextForExport } from './watermarkTextCanvas'
import type {
  WatermarkExportOverlayState,
  WatermarkSelectionRect,
  WatermarkSelectionShape,
  WatermarkTextRecord,
  WatermarkToolMode
} from './watermarkTypes'

export type RunWatermarkExportArgs = {
  watermarkExportInFlightRef: MutableRefObject<boolean>
  blurPreviewSourceRef: RefObject<BlurPreviewSource | null>
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
  /** כשהתמונה הבסיסית כבר כוללת חיתוך/טשטוש שמורים — שולחים פיקסלים ל-main במקום קריאה מהקובץ המקורי. */
  previewBaseImageDataUrl?: string | null
  setEditorError: (msg: string | null) => void
  setExportMsg: (msg: string | null) => void
  setIsExporting: (v: boolean) => void
  setExportOverlay: Dispatch<SetStateAction<WatermarkExportOverlayState>>
}

/** ייצוא תמונה או וידאו עם סימן מים, טקסט וצורות (קורא ל־API הראשי). */
export async function runWatermarkExport(a: RunWatermarkExportArgs): Promise<void> {
  if (a.watermarkExportInFlightRef.current) return
  if (!a.baseImagePath || !a.watermarkImagePath || !a.watermarkRect) {
    a.setEditorError('יש לבחור מדיה ראשית וסימן מים לפני הייצוא.')
    return
  }
  if (a.baseIsVideo) {
    if (!a.baseImageSize || a.videoDurationSec <= 0) {
      a.setEditorError('ממתין לטעינת הווידאו. נסה שוב כשהתצוגה מוכנה.')
      return
    }
    if (a.clipEndSec <= a.clipStartSec) {
      a.setEditorError('זמן הסיום חייב להיות אחרי זמן ההתחלה.')
      return
    }
  } else if (
    (a.activeTool === 'crop' || a.activeTool === 'blur') &&
    !a.selectionRect &&
    !a.previewBaseImageDataUrl
  ) {
    a.setEditorError('בחר אזור על התמונה לפני הייצוא.')
    return
  }

  const {
    baseImagePath,
    watermarkImagePath,
    watermarkRect,
    baseIsVideo,
    baseImageSize,
    videoDurationSec,
    clipStartSec,
    clipEndSec,
    activeTool,
    selectionRect,
    selectionShape,
    blurStrength,
    blurFeather,
    focusSeparation,
    watermarkOpacity,
    textItems,
    shapeItems,
    selectedTextId,
    liveTextContentRectInImage,
    previewBaseImageDataUrl
  } = a

  const exportUsesBakedBase = !!previewBaseImageDataUrl
  const exportToolMode: WatermarkToolMode = exportUsesBakedBase
    ? 'none'
    : activeTool === 'crop' || activeTool === 'blur'
      ? activeTool
      : 'none'

  a.watermarkExportInFlightRef.current = true
  a.setEditorError(null)
  a.setExportMsg(null)
  a.setIsExporting(true)
  let unsubVideoProgress: (() => void) | undefined
  let unsubImageBusy: (() => void) | undefined
  try {
    let textRasterOverlays: Array<{ dataUrl: string; x: number; y: number; width: number; height: number }>
    try {
      textRasterOverlays = []
      for (const item of textItems) {
        if (!item.content.trim()) continue
        const cr =
          item.id === selectedTextId && liveTextContentRectInImage
            ? liveTextContentRectInImage
            : getWatermarkTextContentRectInImage(item)
        textRasterOverlays.push(rasterizeWatermarkTextForExport({ ...item, rotation: item.rotation ?? 0 }, cr))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שכבת טקסט לייצוא נכשלה.'
      a.setEditorError(msg)
      return
    }

    let shapeExportRaster: Array<{ dataUrl: string; x: number; y: number; width: number; height: number }> = []
    try {
      if (shapeItems.length > 0 && baseImageSize) {
        shapeExportRaster = exportWatermarkShapesToOverlays(shapeItems, baseImageSize.width, baseImageSize.height)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שכבת צורות לייצוא נכשלה.'
      a.setEditorError(msg)
      return
    }

    const mergedShapeOverlays = [...textRasterOverlays, ...shapeExportRaster]
    const shapeOverlaysPayload = mergedShapeOverlays.length > 0 ? mergedShapeOverlays : undefined
    const textOverlayPayload = undefined

    if (baseIsVideo) {
      unsubVideoProgress = window.api.onWatermarkVideoExportProgress((p) => {
        a.setExportOverlay((prev) => ({
          kind: 'video',
          percent: Math.min(100, Math.max(0, p.percent)),
          fileName: p.outputBaseName ?? (prev?.kind === 'video' ? prev.fileName : '')
        }))
      })
      const res = await window.api.exportWatermarkedVideo({
        baseVideoPath: baseImagePath,
        watermarkImagePath,
        x: watermarkRect.x,
        y: watermarkRect.y,
        width: watermarkRect.width,
        height: watermarkRect.height,
        opacity: watermarkOpacity,
        startSec: clipStartSec,
        endSec: clipEndSec,
        textOverlay: textOverlayPayload,
        shapeOverlays: shapeOverlaysPayload
      })
      if (!res.ok) {
        if (!res.cancelled) a.setEditorError(res.error ?? 'ייצוא הסרט נכשל.')
        return
      }
      a.setExportMsg(`הסרט יוצא בהצלחה: ${res.filePath}`)
      return
    }

    unsubImageBusy = window.api.onWatermarkImageExportBusy((p) => {
      a.setExportOverlay({ kind: 'image', fileName: p.outputBaseName })
    })
    const res = await window.api.exportWatermarkedImage({
      baseImagePath,
      watermarkImagePath,
      previewBaseImageDataUrl: previewBaseImageDataUrl ?? undefined,
      blurPreviewScale:
        exportToolMode === 'blur' && !exportUsesBakedBase ? a.blurPreviewSourceRef.current?.scale : undefined,
      x: watermarkRect.x,
      y: watermarkRect.y,
      width: watermarkRect.width,
      height: watermarkRect.height,
      opacity: watermarkOpacity,
      toolMode: exportToolMode,
      selectionShape,
      selectionX: exportUsesBakedBase ? undefined : selectionRect?.x,
      selectionY: exportUsesBakedBase ? undefined : selectionRect?.y,
      selectionWidth: exportUsesBakedBase ? undefined : selectionRect?.width,
      selectionHeight: exportUsesBakedBase ? undefined : selectionRect?.height,
      blurStrength,
      blurFeather,
      focusSeparation,
      textOverlay: textOverlayPayload,
      shapeOverlays: shapeOverlaysPayload
    })
    if (!res.ok) {
      if (!res.cancelled) a.setEditorError(res.error ?? 'ייצוא התמונה נכשל.')
      return
    }
    a.setExportMsg(`התמונה יוצאה בהצלחה: ${res.filePath}`)
  } catch (e) {
    a.setEditorError(e instanceof Error ? e.message : 'ייצוא נכשל.')
  } finally {
    unsubVideoProgress?.()
    unsubImageBusy?.()
    a.setExportOverlay(null)
    a.setIsExporting(false)
    a.watermarkExportInFlightRef.current = false
  }
}
