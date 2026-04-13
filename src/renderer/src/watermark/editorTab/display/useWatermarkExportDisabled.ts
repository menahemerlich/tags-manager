import { useMemo } from 'react'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** פרמטרים לחישוב האם כפתור ייצוא מושבת. */
export type UseWatermarkExportDisabledParams = {
  /** האם יש מדיה בסיסית טעונה (נתיב לקובץ). */
  baseImagePath: string | null
  /** האם יש סימן מים (נתיב/asset). */
  watermarkImagePath: string | null
  /** האם מלבן סימן המים מוגדר. */
  watermarkRect: WatermarkSelectionRect | null
  /** האם ייצוא כבר רץ. */
  isExporting: boolean
  /** האם המדיה היא וידאו. */
  baseIsVideo: boolean
  /** משך וידאו כולל בשניות. */
  videoDurationSec: number
  /** תחילת קטע לייצוא בשניות. */
  clipStartSec: number
  /** סוף קטע לייצוא בשניות. */
  clipEndSec: number
}

/** מחשב האם כפתור "ייצוא" צריך להיות מושבת לפי מצב העורך והמדיה. */
export function useWatermarkExportDisabled(params: UseWatermarkExportDisabledParams): boolean {
  /** שומר את כללי ההשבתה במקום אחד כדי למנוע תנאים מפוזרים. */
  const exportDisabled = useMemo(() => {
    if (!params.baseImagePath) return true
    if (!params.watermarkImagePath) return true
    if (!params.watermarkRect) return true
    if (params.isExporting) return true
    if (params.baseIsVideo && (params.videoDurationSec <= 0 || params.clipEndSec <= params.clipStartSec)) return true
    return false
  }, [
    params.baseImagePath,
    params.watermarkImagePath,
    params.watermarkRect,
    params.isExporting,
    params.baseIsVideo,
    params.videoDurationSec,
    params.clipEndSec,
    params.clipStartSec
  ])

  return exportDisabled
}

