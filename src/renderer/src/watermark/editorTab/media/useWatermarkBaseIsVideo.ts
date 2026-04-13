import { useMemo } from 'react'
import { isWatermarkVideoPath } from '../../watermarkHelpers'

/** פרמטרים לחישוב האם המדיה הבסיסית היא וידאו. */
export type UseWatermarkBaseIsVideoParams = {
  /** נתיב קובץ המדיה הבסיסית (אם קיים). */
  baseImagePath: string | null
}

/** מחזיר true אם המדיה הבסיסית היא וידאו לפי סיומת הקובץ. */
export function useWatermarkBaseIsVideo(params: UseWatermarkBaseIsVideoParams): boolean {
  /** מחשב האם מדובר בוידאו בצורה יציבה (memo). */
  const baseIsVideo = useMemo(() => !!params.baseImagePath && isWatermarkVideoPath(params.baseImagePath), [params.baseImagePath])
  return baseIsVideo
}

