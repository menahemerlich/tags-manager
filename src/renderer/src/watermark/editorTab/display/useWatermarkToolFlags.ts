import { useMemo } from 'react'
import type { WatermarkToolMode } from '../../watermarkTypes'

/** סטטוסים נגזרים קצרים שמרכזים את מצב העורך/הכלים. */
export type WatermarkToolFlags = {
  /** האם סימן המים הנוכחי הוא קובץ/asset מותאם (לא ברירת המחדל). */
  isCustomWatermark: boolean
  /** האם כלי בחירה פעיל (חיתוך/טשטוש). */
  isSelectionToolActive: boolean
}

/** פרמטרים לחישוב סטטוסים נגזרים של הכלים. */
export type UseWatermarkToolFlagsParams = {
  /** נתיב סימן מים פעיל (אם קיים). */
  watermarkImagePath: string | null
  /** URL של סימן מים ברירת מחדל (asset מובנה). */
  defaultWatermarkAssetUrl: string
  /** מצב הכלי הפעיל. */
  activeTool: WatermarkToolMode
}

/** מרכז חישוב flags קצרים כדי לשמור את קומפוננטת הטאב רזה. */
export function useWatermarkToolFlags(params: UseWatermarkToolFlagsParams): WatermarkToolFlags {
  /** האם משתמש נבחר סימן מים שאינו ברירת מחדל. */
  const isCustomWatermark = useMemo(
    () => !!params.watermarkImagePath && params.watermarkImagePath !== params.defaultWatermarkAssetUrl,
    [params.defaultWatermarkAssetUrl, params.watermarkImagePath]
  )

  /** האם אחד מכלי הבחירה (crop/blur) פעיל כרגע. */
  const isSelectionToolActive = useMemo(() => params.activeTool === 'crop' || params.activeTool === 'blur', [params.activeTool])

  return { isCustomWatermark, isSelectionToolActive }
}

