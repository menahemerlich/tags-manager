import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlurParams, BlurSelection } from '../../../shared/types'
import {
  createBlurPreviewSource,
  createBlurredPreviewImageData,
  renderBlurPreviewDataUrl,
  type BlurPreviewSource
} from '../blurProcessor'
import type { WatermarkToolMode } from './watermarkTypes'

type Args = {
  activeTool: WatermarkToolMode
  baseImageSrc: string | null
  blurSelection: BlurSelection | null
  blurParams: BlurParams
}

/** תצוגת טשטוש חי על התמונה — מקור, מטמון ו־rAF. */
export function useWatermarkBlurPreview({ activeTool, baseImageSrc, blurSelection, blurParams }: Args) {
  const blurPreviewSourceRef = useRef<BlurPreviewSource | null>(null)
  const blurredPreviewCacheRef = useRef<{ blurStrength: number; imageData: ImageData } | null>(null)
  const blurPreviewFrameRef = useRef<number | null>(null)
  const blurPreviewTimerRef = useRef<number | null>(null)
  const [processedPreviewSrc, setProcessedPreviewSrc] = useState<string | null>(null)
  const [blurPreviewSourceKey, setBlurPreviewSourceKey] = useState(0)

  const resetBlurPreview = useCallback(() => {
    setProcessedPreviewSrc(null)
    setBlurPreviewSourceKey(0)
    blurPreviewSourceRef.current = null
    blurredPreviewCacheRef.current = null
    if (blurPreviewFrameRef.current) {
      window.cancelAnimationFrame(blurPreviewFrameRef.current)
      blurPreviewFrameRef.current = null
    }
    if (blurPreviewTimerRef.current) {
      window.clearTimeout(blurPreviewTimerRef.current)
      blurPreviewTimerRef.current = null
    }
  }, [])

  const softInvalidateBlurSource = useCallback(() => {
    setProcessedPreviewSrc(null)
    blurPreviewSourceRef.current = null
  }, [])

  useEffect(() => {
    let disposed = false

    if (!baseImageSrc) {
      blurPreviewSourceRef.current = null
      blurredPreviewCacheRef.current = null
      setProcessedPreviewSrc(null)
      setBlurPreviewSourceKey(0)
      return
    }

    void createBlurPreviewSource(baseImageSrc)
      .then((source) => {
        if (disposed) return
        blurPreviewSourceRef.current = source
        blurredPreviewCacheRef.current = null
        setBlurPreviewSourceKey((prev) => prev + 1)
        if (activeTool !== 'blur') {
          setProcessedPreviewSrc(null)
        }
      })
      .catch(() => {
        if (disposed) return
        blurPreviewSourceRef.current = null
        blurredPreviewCacheRef.current = null
        setProcessedPreviewSrc(null)
        setBlurPreviewSourceKey(0)
      })

    return () => {
      disposed = true
    }
  }, [activeTool, baseImageSrc])

  const requestBlurPreviewRender = useCallback(
    (debounceMs: number) => {
      if (blurPreviewFrameRef.current) {
        window.cancelAnimationFrame(blurPreviewFrameRef.current)
        blurPreviewFrameRef.current = null
      }
      if (blurPreviewTimerRef.current) {
        window.clearTimeout(blurPreviewTimerRef.current)
        blurPreviewTimerRef.current = null
      }

      if (activeTool !== 'blur' || !blurSelection) {
        setProcessedPreviewSrc(null)
        return
      }

      const render = () => {
        const source = blurPreviewSourceRef.current
        if (!source) return

        const cached = blurredPreviewCacheRef.current
        const blurredImageData =
          cached && cached.blurStrength === blurParams.blurStrength
            ? cached.imageData
            : createBlurredPreviewImageData(source, blurParams)

        if (!cached || cached.blurStrength !== blurParams.blurStrength) {
          blurredPreviewCacheRef.current = { blurStrength: blurParams.blurStrength, imageData: blurredImageData }
        }

        setProcessedPreviewSrc(renderBlurPreviewDataUrl(source, blurredImageData, blurSelection, blurParams))
      }

      const scheduleFrame = () => {
        blurPreviewFrameRef.current = window.requestAnimationFrame(() => {
          blurPreviewFrameRef.current = null
          render()
        })
      }

      if (debounceMs > 0) {
        blurPreviewTimerRef.current = window.setTimeout(scheduleFrame, debounceMs)
      } else {
        scheduleFrame()
      }
    },
    [activeTool, blurParams, blurSelection]
  )

  useEffect(() => {
    requestBlurPreviewRender(0)
    return () => {
      if (blurPreviewFrameRef.current) {
        window.cancelAnimationFrame(blurPreviewFrameRef.current)
        blurPreviewFrameRef.current = null
      }
    }
  }, [activeTool, blurPreviewSourceKey, blurSelection, requestBlurPreviewRender])

  useEffect(() => {
    requestBlurPreviewRender(90)
    return () => {
      if (blurPreviewTimerRef.current) {
        window.clearTimeout(blurPreviewTimerRef.current)
        blurPreviewTimerRef.current = null
      }
    }
  }, [blurParams, blurPreviewSourceKey, requestBlurPreviewRender])

  return {
    processedPreviewSrc,
    blurPreviewSourceRef,
    blurPreviewSourceKey,
    resetBlurPreview,
    softInvalidateBlurSource
  }
}
