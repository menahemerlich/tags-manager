import { useCallback } from 'react'
import { createWatermarkEditorSnapshot, type WatermarkEditorSnapshot } from '../../watermarkEditorSession'
import type { WatermarkLayerEntry } from '../../watermarkLayerOrder'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from '../../watermarkTypes'
import type { WatermarkSavedMediaState } from './watermarkSessionMedia'

/** תלויות לביטול שינויים בסשן. */
export type UseDiscardWatermarkSessionChangesDeps = {
  baseImagePath: string | null
  baseImageSrc: string | null
  /** מידות המדיה הנוכחיות (ל־fallback של מדיה שמורה). */
  baseImageSize: { width: number; height: number } | null
  /** האם הבסיס מגיע מאפייה (data URL). */
  baseImagePixelsFromBake: boolean
  baseVideoUrl: string | null
  /** משך וידאו נוכחי (ל־fallback של מדיה שמורה). */
  videoDurationSec: number

  savedSessionSnapshot: WatermarkEditorSnapshot | null
  hasUnsavedSessionChanges: boolean
  defaultWatermarkAssetUrl: string

  setIsDiscardingSession: (v: boolean) => void
  setEditorError: (v: string | null) => void
  setSessionSaveMsg: (v: string | null) => void
  setActiveTool: (v: WatermarkToolMode) => void
  setWatermarkTextFrameOpen: (v: boolean) => void

  setBaseImagePath: (v: string | null) => void
  setBaseImageSrc: (v: string | null) => void
  setBaseImageSize: (v: { width: number; height: number } | null) => void
  setBaseImagePixelsFromBake: (v: boolean) => void
  setBaseVideoUrl: (v: string | null) => void
  setVideoDurationSec: (v: number) => void

  setSelectionRect: (v: WatermarkSelectionRect | null) => void
  setSelectionShape: (v: WatermarkSelectionShape) => void
  setBlurStrength: (v: number) => void
  setBlurFeather: (v: number) => void
  setFocusSeparation: (v: number) => void
  setLayerOrder: (v: WatermarkLayerEntry[]) => void
  setTextItems: (v: WatermarkTextRecord[]) => void
  setShapeItems: (v: WatermarkShapeRecord[]) => void
  setWatermarkRect: (v: WatermarkSelectionRect | null) => void
  setWatermarkOpacity: (v: number) => void
  setWatermarkAspectRatio: (v: number) => void
  setClipStartSec: (v: number) => void
  setClipEndSec: (v: number) => void

  setWatermarkImagePath: (v: string | null) => void
  setWatermarkImageSrc: (v: string | null) => void
  setSelectedTextId: (fn: (cur: string | null) => string | null) => void
  setSelectedShapeId: (fn: (cur: string | null) => string | null) => void
  setSavedSessionSnapshot: (v: WatermarkEditorSnapshot | null) => void
  setLastSavedSessionMedia: (v: WatermarkSavedMediaState | null) => void
  resetBlurPreview: () => void

  /** baseline ראשוני לשחזור אחרי שמירות. */
  getInitialSessionBaseline: () => { snapshot: WatermarkEditorSnapshot; media: WatermarkSavedMediaState } | null
  /** מדיה שנשמרה לאחרונה (אם קיימת) — עדיף על fallback. */
  getLastSavedSessionMedia: () => WatermarkSavedMediaState | null

  api: {
    getImageDataUrl: (path: string) => Promise<string | null>
  }
}

/** יוצר פעולת ביטול שינויים בסשן (שמירה אחרונה / baseline / טעינה מחדש). */
export function useDiscardWatermarkSessionChanges(
  deps: UseDiscardWatermarkSessionChangesDeps,
  applyBaseMediaPath: (nextPath: string) => Promise<void>
) {
  /** מבטל שינויים: לשמירה אחרונה או לטעינה ראשונית של הקובץ. */
  const handleDiscardSessionChanges = useCallback(async () => {
    if (!deps.baseImagePath || (!deps.baseImageSrc && !deps.baseVideoUrl)) return
    deps.setIsDiscardingSession(true)
    deps.setEditorError(null)

    /** מחיל snapshot + מדיה על מצב העורך. */
    const applySnapshotAndMedia = async (snap: WatermarkEditorSnapshot, media: WatermarkSavedMediaState) => {
      if (media.baseImagePath) {
        deps.setBaseImagePath(media.baseImagePath)
        deps.setBaseImageSrc(media.baseImageSrc)
        deps.setBaseImageSize(media.baseImageSize)
        deps.setBaseImagePixelsFromBake(media.baseImagePixelsFromBake)
        deps.setBaseVideoUrl(media.baseVideoUrl)
        deps.setVideoDurationSec(media.videoDurationSec)
      }

      deps.setSelectionRect(snap.selectionRect)
      deps.setSelectionShape(snap.selectionShape)
      deps.setBlurStrength(snap.blurStrength)
      deps.setBlurFeather(snap.blurFeather)
      deps.setFocusSeparation(snap.focusSeparation)
      deps.setLayerOrder(structuredClone(snap.layerOrder))
      deps.setTextItems(structuredClone(snap.textItems))
      deps.setShapeItems(structuredClone(snap.shapeItems))
      deps.setWatermarkRect(snap.watermarkRect)
      deps.setWatermarkOpacity(snap.watermarkOpacity)
      deps.setWatermarkAspectRatio(snap.watermarkAspectRatio)
      deps.setClipStartSec(snap.clipStartSec)
      deps.setClipEndSec(snap.clipEndSec)

      /** נתיב סימן מים מה־snapshot. */
      /** נתיב סימן מים מה־snapshot. */
      const wp = snap.watermarkImagePath
      if (!wp || wp === deps.defaultWatermarkAssetUrl) {
        deps.setWatermarkImagePath(deps.defaultWatermarkAssetUrl)
        deps.setWatermarkImageSrc(deps.defaultWatermarkAssetUrl)
      } else {
        deps.setWatermarkImagePath(wp)
        try {
          /** data URL לסימן מים מהדיסק. */
          /** data URL לסימן מים מהדיסק. */
          const src = await deps.api.getImageDataUrl(wp)
          if (src) deps.setWatermarkImageSrc(src)
        } catch {
          deps.setEditorError('טעינת סימן המים נכשלה.')
        }
      }

      deps.setSelectedTextId((id) => (id && snap.textItems.some((t) => t.id === id) ? id : null))
      deps.setSelectedShapeId((id) => (id && snap.shapeItems.some((s) => s.id === id) ? id : null))
      deps.resetBlurPreview()
    }

    try {
      deps.setActiveTool('none')
      deps.setWatermarkTextFrameOpen(false)
      deps.setSessionSaveMsg(null)

      if (deps.savedSessionSnapshot === null) {
        await applyBaseMediaPath(deps.baseImagePath)
        deps.setSessionSaveMsg('השינויים בוטלו — הוחזר קובץ המקור מהדיסק.')
        window.setTimeout(() => deps.setSessionSaveMsg(null), 4200)
        return
      }

      if (deps.hasUnsavedSessionChanges) {
        /** snapshot שמור (מועתק) לשחזור. */
        /** snapshot שמור (מועתק) לשחזור. */
        const snap = createWatermarkEditorSnapshot(deps.savedSessionSnapshot)
        /** מדיה שמורה אחרונה (אם קיימת), אחרת fallback למצב הנוכחי. */
        /** מדיה שמורה אחרונה (אם קיימת), אחרת fallback למצב הנוכחי. */
        const media =
          deps.getLastSavedSessionMedia() ??
          ({
            baseImagePath: deps.baseImagePath,
            baseImageSrc: deps.baseImageSrc,
            baseImageSize: deps.baseImageSize,
            baseImagePixelsFromBake: deps.baseImagePixelsFromBake,
            baseVideoUrl: deps.baseVideoUrl,
            videoDurationSec: deps.videoDurationSec
          } as WatermarkSavedMediaState)

        await applySnapshotAndMedia(snap, media)
        deps.setSessionSaveMsg('חזרה למצב השמור האחרון.')
        window.setTimeout(() => deps.setSessionSaveMsg(null), 4200)
        return
      }

      /** baseline ראשוני אם אין שינויים לא שמורים. */
      /** baseline ראשוני אם אין שינויים לא שמורים. */
      const initial = deps.getInitialSessionBaseline()
      if (initial) {
        await applySnapshotAndMedia(createWatermarkEditorSnapshot(initial.snapshot), initial.media)
        deps.setSavedSessionSnapshot(null)
        deps.setLastSavedSessionMedia(null)
        deps.setSessionSaveMsg('הוחזר למצב הטעינה הראשונית של הקובץ (לפני השמירות בסשן).')
        window.setTimeout(() => deps.setSessionSaveMsg(null), 5200)
        return
      }

      await applyBaseMediaPath(deps.baseImagePath)
      deps.setSessionSaveMsg('השינויים בוטלו — הוחזר קובץ המקור מהדיסק.')
      window.setTimeout(() => deps.setSessionSaveMsg(null), 4200)
    } finally {
      deps.setIsDiscardingSession(false)
    }
  }, [applyBaseMediaPath, deps])

  return { handleDiscardSessionChanges }
}
