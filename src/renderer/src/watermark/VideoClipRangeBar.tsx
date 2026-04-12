import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { clampNumber, formatWatermarkTimeSec } from './watermarkHelpers'

const CLIP_HANDLE_MIN_GAP_SEC = 0.15

type Props = {
  durationSec: number
  startSec: number
  endSec: number
  onRangeChange: (start: number, end: number) => void
  videoRef: RefObject<HTMLVideoElement | null>
}

/** פס בחירת טווח זמן לייצוא וידאו — שני ידיות גרירה על ציר. */
export function VideoClipRangeBar(props: Props) {
  const { durationSec, startSec, endSec, onRangeChange, videoRef } = props
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragKind = useRef<'start' | 'end' | null>(null)
  const rangeRef = useRef({ start: startSec, end: endSec })
  rangeRef.current = { start: startSec, end: endSec }

  const posToTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || durationSec <= 0) return 0
      const r = el.getBoundingClientRect()
      const ratio = clampNumber((clientX - r.left) / Math.max(1, r.width), 0, 1)
      return ratio * durationSec
    },
    [durationSec]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const kind = dragKind.current
      if (!kind) return
      const t = posToTime(e.clientX)
      const { start, end } = rangeRef.current
      const gap = CLIP_HANDLE_MIN_GAP_SEC
      if (kind === 'start') {
        const maxS = Math.max(0, end - gap)
        onRangeChange(Math.min(t, maxS), end)
      } else {
        const minE = Math.min(durationSec, start + gap)
        onRangeChange(start, Math.max(t, minE))
      }
    }
    const endDrag = () => {
      dragKind.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [durationSec, onRangeChange, posToTime])

  const pct = (sec: number) => (durationSec > 0 ? (sec / durationSec) * 100 : 0)

  return (
    <div className="watermark-clip-timeline">
      <p className="muted small watermark-clip-timeline-hint">
        גרור את הסימונים לתחילת וסוף הקטע לייצוא. לחיצה על הפס מקדימה את הנגן.
      </p>
      <div className="watermark-clip-timeline-times">
        <span className="watermark-clip-time-label">התחלה {formatWatermarkTimeSec(startSec)}</span>
        <span className="watermark-clip-time-label">סיום {formatWatermarkTimeSec(endSec)}</span>
      </div>
      <div
        ref={trackRef}
        className="watermark-clip-track"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.watermark-clip-handle')) return
          const t = posToTime(e.clientX)
          const v = videoRef.current
          if (v) v.currentTime = t
        }}
        role="presentation"
      >
        <div
          className="watermark-clip-selected"
          style={{ left: `${pct(startSec)}%`, width: `${pct(endSec - startSec)}%` }}
        />
        <button
          type="button"
          className="watermark-clip-handle watermark-clip-handle-start"
          aria-label="תחילת קטע לייצוא"
          style={{ left: `${pct(startSec)}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dragKind.current = 'start'
          }}
        />
        <button
          type="button"
          className="watermark-clip-handle watermark-clip-handle-end"
          aria-label="סוף קטע לייצוא"
          style={{ left: `${pct(endSec)}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dragKind.current = 'end'
          }}
        />
      </div>
    </div>
  )
}
