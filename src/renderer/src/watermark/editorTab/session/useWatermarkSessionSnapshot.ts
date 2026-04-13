import { useMemo } from 'react'
import { createWatermarkEditorSnapshot, watermarkSnapshotsEqual, type WatermarkEditorSnapshot } from '../../watermarkEditorSession'
import type { WatermarkLayerEntry } from '../../watermarkLayerOrder'
import type { WatermarkSelectionRect, WatermarkSelectionShape, WatermarkTextRecord } from '../../watermarkTypes'
import type { WatermarkShapeRecord } from '../../watermarkShapeModel'

/** פרמטרים ליצירת snapshot נוכחי ולבדיקת “שינויים לא שמורים”. */
export type UseWatermarkSessionSnapshotParams = {
  /** האם יש מדיה טעונה (נתיב לקובץ). */
  baseImagePath: string | null
  /** snapshot אחרון שנשמר. */
  savedSessionSnapshot: WatermarkEditorSnapshot | null
  /** מלבן בחירה (crop/blur) ביחידות מדיה. */
  selectionRect: WatermarkSelectionRect | null
  /** צורת הבחירה (מלבן/עיגול). */
  selectionShape: WatermarkSelectionShape
  /** עוצמת blur. */
  blurStrength: number
  /** רוחב feather ל־blur. */
  blurFeather: number
  /** פרמטר separation (פוקוס). */
  focusSeparation: number
  /** סדר שכבות משולב. */
  layerOrder: WatermarkLayerEntry[]
  /** שכבות טקסט. */
  textItems: WatermarkTextRecord[]
  /** שכבות צורות. */
  shapeItems: WatermarkShapeRecord[]
  /** מלבן סימן מים ביחידות מדיה. */
  watermarkRect: WatermarkSelectionRect | null
  /** שקיפות סימן מים. */
  watermarkOpacity: number
  /** יחס־ממדים פעיל של סימן מים. */
  watermarkAspectRatio: number
  /** נתיב סימן מים (asset/קובץ). */
  watermarkImagePath: string | null
  /** התחלת קטע (וידאו). */
  clipStartSec: number
  /** סיום קטע (וידאו). */
  clipEndSec: number
}

/** תוצאת snapshot: snapshot נוכחי + האם יש שינויים לא שמורים. */
export type WatermarkSessionSnapshotState = {
  /** snapshot נוכחי של מצב העורך. */
  currentSessionSnapshot: WatermarkEditorSnapshot
  /** האם יש שינויים לא שמורים ביחס ל־snapshot שנשמר. */
  hasUnsavedSessionChanges: boolean
}

/** מרכז יצירת snapshot נוכחי וחישוב "dirty" לסשן. */
export function useWatermarkSessionSnapshot(params: UseWatermarkSessionSnapshotParams): WatermarkSessionSnapshotState {
  /** snapshot נוכחי שנגזר מכל מצב העורך הרלוונטי לשמירה. */
  const currentSessionSnapshot = useMemo(
    () =>
      createWatermarkEditorSnapshot({
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
      }),
    [
      params.blurFeather,
      params.blurStrength,
      params.clipEndSec,
      params.clipStartSec,
      params.focusSeparation,
      params.layerOrder,
      params.selectionRect,
      params.selectionShape,
      params.shapeItems,
      params.textItems,
      params.watermarkAspectRatio,
      params.watermarkImagePath,
      params.watermarkOpacity,
      params.watermarkRect
    ]
  )

  /** האם יש שינויים לא שמורים ביחס ל־snapshot האחרון שנשמר. */
  const hasUnsavedSessionChanges = useMemo(() => {
    if (!params.baseImagePath) return false
    if (params.savedSessionSnapshot === null) return true
    return !watermarkSnapshotsEqual(params.savedSessionSnapshot, currentSessionSnapshot)
  }, [params.baseImagePath, params.savedSessionSnapshot, currentSessionSnapshot])

  return { currentSessionSnapshot, hasUnsavedSessionChanges }
}

