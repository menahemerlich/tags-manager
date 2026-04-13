import { useCallback } from 'react'

/** פרמטרים למדידת גודל הבמה (DOM) עבור תצוגת המדיה. */
export type UseStageSizeMeasurementParams = {
  stageMediaWrapRef: React.RefObject<HTMLDivElement | null>
  baseVideoRef: React.RefObject<HTMLVideoElement | null>
  baseImgRef: React.RefObject<HTMLImageElement | null>
  setStageSize: (fn: (prev: { width: number; height: number }) => { width: number; height: number }) => void
}

/** מחזיר callback שמודד ומעדכן את גודל הבמה לפי עטיפה/מדיה. */
export function useStageSizeMeasurement(params: UseStageSizeMeasurementParams) {
  const updateStageSize = useCallback(() => {
    const wrap = params.stageMediaWrapRef.current
    const media = params.baseVideoRef.current ?? params.baseImgRef.current
    const measureEl = wrap ?? media
    if (!measureEl) return

    const rect = measureEl.getBoundingClientRect()
    let w = Math.max(0, Math.round(rect.width))
    let h = Math.max(0, Math.round(rect.height))
    if (w <= 0 || h <= 0) {
      w = Math.max(0, Math.round((measureEl as any).offsetWidth))
      h = Math.max(0, Math.round((measureEl as any).offsetHeight))
    }
    if ((w <= 0 || h <= 0) && media) {
      w = Math.max(0, Math.round((media as any).offsetWidth))
      h = Math.max(0, Math.round((media as any).offsetHeight))
    }

    /** אותו ערך כמו קודם → אותו אובייקט state, כדי לא ליצור לולאת רינדור עם ResizeObserver / layout. */
    params.setStageSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
  }, [params])

  return { updateStageSize }
}

