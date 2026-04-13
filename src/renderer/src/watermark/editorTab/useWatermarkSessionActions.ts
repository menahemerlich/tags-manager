import type { WatermarkEditorSnapshot } from '../watermarkEditorSession'
import type { WatermarkShapeRecord } from '../watermarkShapeModel'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from '../watermarkTypes'
import type { WatermarkLayerEntry } from '../watermarkLayerOrder'
import type { WatermarkSavedMediaState } from './session/watermarkSessionMedia'
import { useApplyBaseWatermarkMediaPath, type UseApplyBaseWatermarkMediaPathDeps } from './session/useApplyBaseWatermarkMediaPath'
import { useDiscardWatermarkSessionChanges, type UseDiscardWatermarkSessionChangesDeps } from './session/useDiscardWatermarkSessionChanges'
import { useSaveWatermarkSession, type UseSaveWatermarkSessionDeps } from './session/useSaveWatermarkSession'

/** תלויות נדרשות לפעולות שמירה/ביטול/טעינת מדיה בעורך סימן מים. */
export type UseWatermarkSessionActionsDeps = UseApplyBaseWatermarkMediaPathDeps &
  UseSaveWatermarkSessionDeps &
  UseDiscardWatermarkSessionChangesDeps & {
    /** האם יש שינויים שלא נשמרו. */
    hasUnsavedSessionChanges: boolean
    /** צילום מצב שמור להשוואה. */
    savedSessionSnapshot: WatermarkEditorSnapshot | null
    /** מזהה אייקון ברירת המחדל (file URL). */
    defaultWatermarkAssetUrl: string

    /** עדכון הודעות שגיאה/סטטוס. */
    setExportMsg: (v: string | null) => void
    setSessionSaveMsg: (v: string | null) => void
    /** דגל תהליך. */
    setIsSavingSession: (v: boolean) => void
    setIsDiscardingSession: (v: boolean) => void

    /** רענון תצוגת טשטוש. */
    resetBlurPreview: () => void
    softInvalidateBlurSource: () => void

    /** API של preload. */
    api: {
      bakeWatermarkTool: (payload: any) => Promise<string | null>
      trimVideoSegment: (payload: any) => Promise<{ ok: boolean; outputPath?: string; error?: string }>
      getMediaUrl: (path: string) => Promise<string>
      getImageDataUrl: (path: string) => Promise<string | null>
    }

    /** קריאה למדיה השמורה האחרונה (ref) — משמש לשחזור מדויק אחרי ביטול. */
    getLastSavedSessionMedia: () => WatermarkSavedMediaState | null
  }

/** מרכז פעולות סשן: שמירה, ביטול, וטעינת מדיה מחדש. */
export function useWatermarkSessionActions(deps: UseWatermarkSessionActionsDeps) {
  const { applyBaseMediaPath } = useApplyBaseWatermarkMediaPath(deps)
  const { handleSaveSession } = useSaveWatermarkSession(deps)
  const { handleDiscardSessionChanges } = useDiscardWatermarkSessionChanges(deps, applyBaseMediaPath)

  return { applyBaseMediaPath, handleSaveSession, handleDiscardSessionChanges }
}

export type { WatermarkSavedMediaState } from './session/watermarkSessionMedia'
