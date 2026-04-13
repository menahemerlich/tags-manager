import { useCallback } from 'react'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import { createDefaultSelectionRect, mapLayersAfterImageCrop } from '../../watermarkPlacement'
import { loadImageDimensions } from '../../watermarkHelpers'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from '../../watermarkTypes'
import { createWatermarkEditorSnapshot, type WatermarkEditorSnapshot } from '../../watermarkEditorSession'
import type { WatermarkLayerEntry } from '../../watermarkLayerOrder'
import type { WatermarkSavedMediaState } from './watermarkSessionMedia'

/** תלויות לשמירת סשן (אפייה/חיתוך וידאו/צילום snapshot). */
export type UseSaveWatermarkSessionDeps = {
  baseIsVideo: boolean
  baseImagePath: string | null
  baseImageSrc: string | null
  baseImageSize: { width: number; height: number } | null
  baseVideoUrl: string | null
  videoDurationSec: number
  clipStartSec: number
  clipEndSec: number
  baseImagePixelsFromBake: boolean

  activeTool: WatermarkToolMode
  selectionRect: WatermarkSelectionRect | null
  selectionShape: WatermarkSelectionShape
  blurStrength: number
  blurFeather: number
  focusSeparation: number

  watermarkRect: WatermarkSelectionRect | null
  watermarkOpacity: number
  watermarkAspectRatio: number
  watermarkImagePath: string | null

  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
  layerOrder: WatermarkLayerEntry[]

  setIsSavingSession: (v: boolean) => void
  setEditorError: (v: string | null) => void
  setSessionSaveMsg: (v: string | null) => void

  setBaseImageSrc: (v: string | null) => void
  setBaseImageSize: (v: { width: number; height: number } | null) => void
  setBaseImagePixelsFromBake: (v: boolean) => void
  setWatermarkRect: (v: WatermarkSelectionRect | null) => void
  setTextItems: (v: WatermarkTextRecord[]) => void
  setShapeItems: (v: WatermarkShapeRecord[]) => void
  setSelectedTextId: (fn: (cur: string | null) => string | null) => void
  setSelectedShapeId: (fn: (cur: string | null) => string | null) => void
  setSelectionRect: (v: WatermarkSelectionRect | null) => void
  setActiveTool: (v: WatermarkToolMode) => void
  resetBlurPreview: () => void
  setSavedSessionSnapshot: (v: WatermarkEditorSnapshot | null) => void

  setBaseImagePath: (v: string | null) => void
  setBaseVideoUrl: (v: string | null) => void
  setVideoDurationSec: (v: number) => void
  setClipStartSec: (v: number) => void
  setClipEndSec: (v: number) => void

  setLastSavedSessionMedia: (v: WatermarkSavedMediaState | null) => void
  setInitialBaselineCapturedForPath: (v: string | null) => void

  api: {
    bakeWatermarkTool: (payload: any) => Promise<string | null>
    trimVideoSegment: (payload: any) => Promise<{ ok: boolean; outputPath?: string; error?: string }>
    getMediaUrl: (path: string) => Promise<string>
  }
}

/** יוצר פעולת שמירת סשן (אפייה/חיתוך/צילום מצב). */
export function useSaveWatermarkSession(deps: UseSaveWatermarkSessionDeps) {
  /** שומר נקודת ייחוס: אפייה לתמונה, חיתוך וידאו, או צילום מצב. */
  const handleSaveSession = useCallback(async () => {
    /** האם צריך לאפות crop/blur לתמונה (ולא בוידאו). */
    const shouldBakeTool =
      !deps.baseIsVideo &&
      !!deps.baseImageSrc &&
      !!deps.baseImageSize &&
      !!deps.selectionRect &&
      (deps.baseImagePath || deps.baseImagePixelsFromBake) &&
      (deps.activeTool === 'crop' || deps.activeTool === 'blur')

    if (shouldBakeTool) {
      deps.setIsSavingSession(true)
      deps.setEditorError(null)
      try {
        /** data URL של תמונה אפויה אחרי כלי crop/blur. */
        /** תוצאת אפייה מהמערכת הראשית (data URL). */
        const dataUrl = await deps.api.bakeWatermarkTool({
          baseImagePath: deps.baseImagePixelsFromBake ? undefined : deps.baseImagePath ?? undefined,
          baseImageDataUrl: deps.baseImagePixelsFromBake ? deps.baseImageSrc : undefined,
          toolMode: deps.activeTool,
          selectionShape: deps.selectionShape,
          selectionX: deps.selectionRect!.x,
          selectionY: deps.selectionRect!.y,
          selectionWidth: deps.selectionRect!.width,
          selectionHeight: deps.selectionRect!.height,
          blurStrength: deps.blurStrength,
          blurFeather: deps.blurFeather,
          focusSeparation: deps.focusSeparation
        })
        if (!dataUrl) {
          deps.setEditorError('לא ניתן היה לשמור את השינויים — נסה שוב.')
          return
        }

        /** מידות התמונה אחרי אפייה. */
        /** מידות התמונה אחרי אפייה. */
        const dims = await loadImageDimensions(dataUrl)
        /** מלבן סימן מים אחרי מיפוי (אם crop). */
        let nextWatermark = deps.watermarkRect
        /** טקסטים אחרי מיפוי (אם crop). */
        let nextTexts = deps.textItems
        /** צורות אחרי מיפוי (אם crop). */
        let nextShapes = deps.shapeItems
        if (deps.activeTool === 'crop') {
          /** תוצאת מיפוי שכבות אחרי חיתוך תמונה. */
          /** מיפוי שכבות אחרי חיתוך תמונה. */
        const mapped = mapLayersAfterImageCrop(
            deps.selectionRect!.x,
            deps.selectionRect!.y,
            dims.width,
            dims.height,
            deps.watermarkRect,
            deps.textItems,
            deps.shapeItems
          )
          nextWatermark = mapped.watermarkRect
          nextTexts = mapped.textItems
          nextShapes = mapped.shapeItems
        }

        /** בחירה חדשה ברירת מחדל אחרי אפייה. */
        /** בחירה חדשה ברירת מחדל אחרי אפייה. */
        const nextSel = createDefaultSelectionRect(dims.width, dims.height)
        deps.setBaseImageSrc(dataUrl)
        deps.setBaseImageSize(dims)
        deps.setBaseImagePixelsFromBake(true)
        deps.setWatermarkRect(nextWatermark)
        deps.setTextItems(nextTexts)
        deps.setShapeItems(nextShapes)
        deps.setSelectedTextId((id) => (id && nextTexts.some((t) => t.id === id) ? id : null))
        deps.setSelectedShapeId((id) => (id && nextShapes.some((s) => s.id === id) ? id : null))
        deps.setSelectionRect(nextSel)
        deps.setActiveTool('none')
        deps.resetBlurPreview()
        deps.setSavedSessionSnapshot(
          createWatermarkEditorSnapshot({
            selectionRect: nextSel,
            selectionShape: deps.selectionShape,
            blurStrength: deps.blurStrength,
            blurFeather: deps.blurFeather,
            focusSeparation: deps.focusSeparation,
            layerOrder: deps.layerOrder,
            textItems: nextTexts,
            shapeItems: nextShapes,
            watermarkRect: nextWatermark,
            watermarkOpacity: deps.watermarkOpacity,
            watermarkAspectRatio: deps.watermarkAspectRatio,
            watermarkImagePath: deps.watermarkImagePath,
            clipStartSec: deps.clipStartSec,
            clipEndSec: deps.clipEndSec
          })
        )
        deps.setSessionSaveMsg('השינויים נשמרו — התמונה עודכנה; אפשר להמשיך עם כלים נוספים.')
        window.setTimeout(() => deps.setSessionSaveMsg(null), 5200)
        if (deps.baseImagePath) {
          deps.setLastSavedSessionMedia({
            baseImagePath: deps.baseImagePath,
            baseImageSrc: dataUrl,
            baseImageSize: dims,
            baseImagePixelsFromBake: true,
            baseVideoUrl: null,
            videoDurationSec: 0
          })
        }
      } finally {
        deps.setIsSavingSession(false)
      }
      return
    }

    /** סף טולרנס לזיהוי “לא חתכו” בפועל בקצוות הווידאו. */
    const tol = 0.08
    /** האם צריך לחתוך וידאו לפי טווח שנבחר. */
    const shouldTrimVideo =
      deps.baseIsVideo &&
      !!deps.baseImagePath &&
      deps.videoDurationSec > 0 &&
      deps.clipEndSec > deps.clipStartSec &&
      !(deps.clipStartSec <= tol && deps.clipEndSec >= deps.videoDurationSec - tol)

    if (shouldTrimVideo) {
      deps.setIsSavingSession(true)
      deps.setEditorError(null)
      try {
        /** תוצאת חיתוך וידאו מהמערכת הראשית. */
        /** תוצאת חיתוך וידאו מהמערכת הראשית. */
        const res = await deps.api.trimVideoSegment({
          inputPath: deps.baseImagePath,
          startSec: deps.clipStartSec,
          endSec: deps.clipEndSec
        })
        if (!res.ok) {
          deps.setEditorError(res.error || 'חיתוך הסרט נכשל.')
          return
        }
        /** משך חדש אחרי חיתוך. */
        /** משך חדש אחרי חיתוך. */
        const newDur = deps.clipEndSec - deps.clipStartSec
        /** URL לניגון הווידאו החתוך. */
        /** URL לניגון הווידאו החתוך. */
        const url = await deps.api.getMediaUrl(res.outputPath!)
        deps.setBaseImagePath(res.outputPath!)
        deps.setBaseVideoUrl(url)
        deps.setVideoDurationSec(newDur)
        deps.setClipStartSec(0)
        deps.setClipEndSec(newDur)
        deps.setSavedSessionSnapshot(
          createWatermarkEditorSnapshot({
            selectionRect: deps.selectionRect,
            selectionShape: deps.selectionShape,
            blurStrength: deps.blurStrength,
            blurFeather: deps.blurFeather,
            focusSeparation: deps.focusSeparation,
            layerOrder: deps.layerOrder,
            textItems: deps.textItems,
            shapeItems: deps.shapeItems,
            watermarkRect: deps.watermarkRect,
            watermarkOpacity: deps.watermarkOpacity,
            watermarkAspectRatio: deps.watermarkAspectRatio,
            watermarkImagePath: deps.watermarkImagePath,
            clipStartSec: 0,
            clipEndSec: newDur
          })
        )
        deps.setSessionSaveMsg('השינויים נשמרו — הסרט החתוך מוצג כעת.')
        window.setTimeout(() => deps.setSessionSaveMsg(null), 5200)
        deps.setLastSavedSessionMedia({
          baseImagePath: res.outputPath!,
          baseImageSrc: null,
          baseImageSize: deps.baseImageSize,
          baseImagePixelsFromBake: false,
          baseVideoUrl: url,
          videoDurationSec: newDur
        })
        deps.setInitialBaselineCapturedForPath(res.outputPath!)
      } finally {
        deps.setIsSavingSession(false)
      }
      return
    }

    deps.setSavedSessionSnapshot(
      createWatermarkEditorSnapshot({
        selectionRect: deps.selectionRect,
        selectionShape: deps.selectionShape,
        blurStrength: deps.blurStrength,
        blurFeather: deps.blurFeather,
        focusSeparation: deps.focusSeparation,
        layerOrder: deps.layerOrder,
        textItems: deps.textItems,
        shapeItems: deps.shapeItems,
        watermarkRect: deps.watermarkRect,
        watermarkOpacity: deps.watermarkOpacity,
        watermarkAspectRatio: deps.watermarkAspectRatio,
        watermarkImagePath: deps.watermarkImagePath,
        clipStartSec: deps.clipStartSec,
        clipEndSec: deps.clipEndSec
      })
    )
    deps.setEditorError(null)
    deps.setSessionSaveMsg('השינויים נשמרו — אפשר לעבור בין כלים; הנקודה השמורה משמשת להשוואה לשינויים הבאים.')
    window.setTimeout(() => deps.setSessionSaveMsg(null), 5200)
    if (deps.baseImagePath) {
      deps.setLastSavedSessionMedia({
        baseImagePath: deps.baseImagePath,
        baseImageSrc: deps.baseImageSrc,
        baseImageSize: deps.baseImageSize,
        baseImagePixelsFromBake: deps.baseImagePixelsFromBake,
        baseVideoUrl: deps.baseVideoUrl,
        videoDurationSec: deps.videoDurationSec
      })
    }
  }, [deps])

  return { handleSaveSession }
}
