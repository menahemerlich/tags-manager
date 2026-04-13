import { useCallback } from 'react'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import { clampWatermarkIntoBounds, createDefaultSelectionRect, placeDefaultWatermark } from '../../watermarkPlacement'
import { isWatermarkVideoPath, loadImageDimensions } from '../../watermarkHelpers'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from '../../watermarkTypes'
import { createWatermarkEditorSnapshot, type WatermarkEditorSnapshot } from '../../watermarkEditorSession'
import type { WatermarkSavedMediaState } from './watermarkSessionMedia'

/** תלויות לטעינת מדיה בסיסית חדשה ואיפוס מצב עריכה תואם. */
export type UseApplyBaseWatermarkMediaPathDeps = {
  /** מצב הכלי הפעיל. */
  activeTool: WatermarkToolMode
  /** מסגרת בחירה לכלי חיתוך/טשטוש. */
  selectionRect: WatermarkSelectionRect | null
  /** צורת בחירה (מלבן/עיגול). */
  selectionShape: WatermarkSelectionShape
  /** ערכי טשטוש. */
  blurStrength: number
  blurFeather: number
  focusSeparation: number
  /** שכבות. */
  watermarkRect: WatermarkSelectionRect | null
  watermarkOpacity: number
  watermarkAspectRatio: number
  watermarkImagePath: string | null
  watermarkImageSrc: string | null

  setEditorError: (v: string | null) => void
  setExportMsg: (v: string | null) => void
  setSavedSessionSnapshot: (v: WatermarkEditorSnapshot | null) => void
  setLastSavedSessionMedia: (v: WatermarkSavedMediaState | null) => void
  setInitialSessionBaseline: (v: { snapshot: WatermarkEditorSnapshot; media: WatermarkSavedMediaState } | null) => void
  setInitialBaselineCapturedForPath: (v: string | null) => void
  setSessionSaveMsg: (v: string | null) => void
  setBaseImagePixelsFromBake: (v: boolean) => void

  setActiveTool: (v: WatermarkToolMode) => void
  softInvalidateBlurSource: () => void
  setBaseImageSrc: (v: string | null) => void
  setBaseImageSize: (v: { width: number; height: number } | null) => void
  setSelectionRect: (v: WatermarkSelectionRect | null) => void
  setWatermarkRect: (v: WatermarkSelectionRect | null) => void
  setTextItems: (v: WatermarkTextRecord[]) => void
  setSelectedTextId: (fn: (cur: string | null) => string | null) => void
  setShapeItems: (v: WatermarkShapeRecord[]) => void
  setSelectedShapeId: (fn: (cur: string | null) => string | null) => void
  setBaseImagePath: (v: string | null) => void
  setBaseVideoUrl: (v: string | null) => void
  setVideoDurationSec: (v: number) => void
  setClipStartSec: (v: number) => void
  setClipEndSec: (v: number) => void

  api: {
    getMediaUrl: (path: string) => Promise<string>
    getImageDataUrl: (path: string) => Promise<string | null>
  }
}

/** יוצר פעולה שמחילה מדיה בסיסית חדשה ומאפסת מצב עריכה תואם. */
export function useApplyBaseWatermarkMediaPath(deps: UseApplyBaseWatermarkMediaPathDeps) {
  /** טוען מדיה ראשית ומאפס מצב עריכה תואם. */
  const applyBaseMediaPath = useCallback(
    async (nextPath: string): Promise<void> => {
      deps.setEditorError(null)
      deps.setExportMsg(null)
      deps.setSavedSessionSnapshot(null)
      deps.setLastSavedSessionMedia(null)
      deps.setInitialSessionBaseline(null)
      deps.setInitialBaselineCapturedForPath(null)
      deps.setSessionSaveMsg(null)
      deps.setBaseImagePixelsFromBake(false)

      if (isWatermarkVideoPath(nextPath)) {
        deps.setActiveTool('none')
        deps.softInvalidateBlurSource()
        deps.setBaseImageSrc(null)
        deps.setBaseImageSize(null)
        deps.setSelectionRect(null)
        deps.setWatermarkRect(null)
        deps.setTextItems([])
        deps.setSelectedTextId(() => null)
        deps.setShapeItems([])
        deps.setSelectedShapeId(() => null)
        deps.setBaseImagePath(nextPath)
        try {
          /** URL לניגון הוידאו מהמערכת הראשית. */
          const url = await deps.api.getMediaUrl(nextPath)
          deps.setBaseVideoUrl(url)
        } catch {
          deps.setEditorError('טעינת הסרט נכשלה.')
          deps.setBaseImagePath(null)
          deps.setBaseVideoUrl(null)
          return
        }
        deps.setVideoDurationSec(0)
        deps.setClipStartSec(0)
        deps.setClipEndSec(0)
        return
      }

      deps.setBaseVideoUrl(null)
      deps.setVideoDurationSec(0)
      deps.setClipStartSec(0)
      deps.setClipEndSec(0)
      deps.setTextItems([])
      deps.setSelectedTextId(() => null)
      deps.setShapeItems([])
      deps.setSelectedShapeId(() => null)

      /** data URL של התמונה הראשית. */
      const nextSrc = await deps.api.getImageDataUrl(nextPath)
      if (!nextSrc) {
        deps.setEditorError('טעינת התמונה הראשית נכשלה.')
        return
      }
      /** מידות התמונה הראשית. */
      const dims = await loadImageDimensions(nextSrc)
      deps.setBaseImagePath(nextPath)
      deps.setBaseImageSrc(nextSrc)
      deps.setBaseImageSize(dims)

      /** מלבן בחירה לאחר טעינה (תלוי בכלי פעיל). */
      const nextSelection = deps.activeTool !== 'none' ? createDefaultSelectionRect(dims.width, dims.height) : deps.selectionRect

      /** מלבן סימן מים לאחר טעינה (אם יש מקור לסימן מים). */
      let nextWatermarkRect: WatermarkSelectionRect | null = null
      if (deps.watermarkImageSrc) {
        /** מלבן ברירת מחדל לפי יחס־ממדים. */
        const defaultRect = placeDefaultWatermark(dims.width, dims.height, deps.watermarkAspectRatio)
        nextWatermarkRect = clampWatermarkIntoBounds(defaultRect, dims, deps.activeTool === 'crop' ? nextSelection : null)
        deps.setWatermarkRect(nextWatermarkRect)
      } else {
        deps.setWatermarkRect(null)
      }
      deps.setSelectionRect(nextSelection)

      deps.setInitialBaselineCapturedForPath(nextPath)
      deps.setInitialSessionBaseline({
        snapshot: createWatermarkEditorSnapshot({
          selectionRect: nextSelection,
          selectionShape: deps.selectionShape,
          blurStrength: deps.blurStrength,
          blurFeather: deps.blurFeather,
          focusSeparation: deps.focusSeparation,
          layerOrder: [],
          textItems: [],
          shapeItems: [],
          watermarkRect: nextWatermarkRect,
          watermarkOpacity: deps.watermarkOpacity,
          watermarkAspectRatio: deps.watermarkAspectRatio,
          watermarkImagePath: deps.watermarkImagePath,
          clipStartSec: 0,
          clipEndSec: 0
        }),
        media: {
          baseImagePath: nextPath,
          baseImageSrc: nextSrc,
          baseImageSize: dims,
          baseImagePixelsFromBake: false,
          baseVideoUrl: null,
          videoDurationSec: 0
        }
      })
    },
    [deps]
  )

  return { applyBaseMediaPath }
}
