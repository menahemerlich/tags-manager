import { useCallback } from 'react'
import { clampWatermarkIntoBounds, placeDefaultWatermark } from '../../watermarkPlacement'
import type { WatermarkSelectionRect } from '../../watermarkTypes'

/** פרמטרים לטעינת מטא־דאטה של וידאו (מימדים ומשך) לתוך הסטייט. */
export type UseBaseVideoMetadataParams = {
  baseVideoRef: React.RefObject<HTMLVideoElement | null>
  watermarkImageSrc: string | null
  watermarkAspectRatio: number
  setBaseImageSize: (v: { width: number; height: number } | null) => void
  setVideoDurationSec: (v: number) => void
  setClipStartSec: (v: number) => void
  setClipEndSec: (v: number) => void
  setWatermarkRect: (v: WatermarkSelectionRect | null) => void
}

/** מחזיר handler שמעדכן מימדים/משך וידאו, וממקם סימן מים ברירת מחדל. */
export function useBaseVideoMetadata(params: UseBaseVideoMetadataParams) {
  const onBaseVideoMetadata = useCallback(() => {
    const v = params.baseVideoRef.current
    if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) return
    const w = v.videoWidth
    const h = v.videoHeight
    params.setBaseImageSize({ width: w, height: h })
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    params.setVideoDurationSec(dur)
    params.setClipStartSec(0)
    params.setClipEndSec(dur > 0 ? dur : 0.1)
    if (params.watermarkImageSrc) {
      const ratio = params.watermarkAspectRatio > 0 ? params.watermarkAspectRatio : 1
      const defaultRect = placeDefaultWatermark(w, h, ratio, { isVideo: true })
      params.setWatermarkRect(clampWatermarkIntoBounds(defaultRect, { width: w, height: h }, null))
    } else {
      params.setWatermarkRect(null)
    }
  }, [params])

  return { onBaseVideoMetadata }
}

