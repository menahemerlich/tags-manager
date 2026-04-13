import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MediaPathDiagnostics } from '../../../shared/api'
import type { PathKind } from '../../../shared/types'

/** Above app chrome, table stacking, Virtuoso — portal to body avoids trapped stacking contexts. */
const PREVIEW_OVERLAY_Z = 2147483000

function isVideoPath(filePath: string): boolean {
  const p = filePath.toLowerCase()
  return (
    p.endsWith('.mp4') ||
    p.endsWith('.mov') ||
    p.endsWith('.mkv') ||
    p.endsWith('.webm') ||
    p.endsWith('.avi') ||
    p.endsWith('.m4v')
  )
}

/** Faces: raster images only; watermark: raster images or video. */
function isRasterImagePath(filePath: string): boolean {
  if (isVideoPath(filePath)) return false
  const base = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  const m = base.match(/\.([^.]+)$/)
  if (!m) return false
  return /^(jpe?g|png|gif|webp|bmp|avif|heic|heif|tiff?)$/.test(m[1])
}

function humanizePreviewError(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('ffmpeg not available') || m.includes('ffprobe not available')) {
    return 'FFmpeg לא זמין (נדרש ליצירת תצוגה מקדימה לוידאו).'
  }
  if (m.includes('unsupported media type')) {
    return 'קובץ לא נתמך לתצוגה מקדימה.'
  }
  if (m.includes('recently failed')) {
    return 'יצירת תצוגה מקדימה נכשלה לאחרונה. נסו שוב בעוד כמה דקות.'
  }
  if (m.includes('file not found') || m.includes('enoent')) {
    return 'לא נמצא בנתיב'
  }
  return raw.trim().length > 0 ? raw : 'שגיאה לא צפויה.'
}

function truncateOneLine(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

/** אייקון תיקייה לתא התצוגה המקדימה הקטן (בלי טעינת תמונה מהדיסק). */
function FolderPreviewGlyph({ pixelSize }: { pixelSize: number }) {
  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path
        d="M3.25 8.25c0-1.1.9-2 2-2h4.35l1.15 1.15.5.5H18.5c1 0 1.75.75 1.75 1.75v8.5c0 1.1-.9 2-2 2H5.25c-1.1 0-2-.9-2-2v-9.9z"
        fill="rgba(0, 212, 255, 0.14)"
        stroke="rgba(0, 212, 255, 0.62)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M3.25 8h6.1l.85.85H18.6"
        stroke="rgba(148, 163, 184, 0.45)"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** LTR isolate so Windows paths (E:\… + Hebrew segments) don’t break in RTL tooltips. */
const LRI = '\u2066'
const PDI = '\u2069'

/** Single short line for native tooltip (avoids huge scrollable browser tooltips). */
function compactPathDebugLine(d: MediaPathDiagnostics): string {
  const cps = d.leadingCodePoints
    .slice(0, 4)
    .map((x) => x.cp.toString(16))
    .join('.')
  const np = truncateOneLine(d.normalizedLikeOpenButton, 42)
  const fsOk = d.resolvedExistingPath ? 'ok' : 'no'
  const technical = `L${d.receivedLength} u${cps || '-'} fs:${fsOk} ${np}`
  return `${LRI}${technical}${PDI}`
}

/** תצוגה מקדימה לקובץ (תמונה/וידאו) עם כפתורי פתיחה בזיהוי פנים או עורך סימן מים */
export function FilePreview(props: {
  filePath: string
  /** כאשר `folder` — אייקון תיקייה בלי טעינת תצוגה מקדימה. */
  pathKind?: PathKind
  size?: number
  onOpenInWatermark?: (path: string) => void
  onOpenInFaces?: (path: string) => void
}) {
  const { filePath, pathKind = 'file', size = 36, onOpenInWatermark, onOpenInFaces } = props
  const ref = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pathDebug, setPathDebug] = useState<MediaPathDiagnostics | null>(null)

  useEffect(() => {
    thumbRef.current = null
    setThumbUrl(null)
    setError(null)
    setLoading(false)
    setOpen(false)
    setFullUrl(null)
    inFlightRef.current = false
    setPathDebug(null)
  }, [filePath])

  useEffect(() => {
    thumbRef.current = thumbUrl
  }, [thumbUrl])

  const requestThumb = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    if (!force && thumbRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    if (force) {
      thumbRef.current = null
      setThumbUrl(null)
    }
    try {
      const u = await window.api.getThumbnail(filePath, force ? { force: true } : undefined)
      thumbRef.current = u
      setThumbUrl(u)
      setError(null)
    } catch (err) {
      const msg = (err as Error).message || String(err)
      setError(humanizePreviewError(msg))
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [filePath])

  useEffect(() => {
    if (pathKind === 'folder') return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e?.isIntersecting) return
        io.disconnect()
        void requestThumb(false)
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [filePath, pathKind, requestThumb])

  useEffect(() => {
    if (!error) return
    const looksLikeMissingFile =
      error.includes('לא נמצא') || error.toLowerCase().includes('file not found')
    if (!looksLikeMissingFile) return
    let cancelled = false
    void window.api.explainMediaPath(filePath).then((d) => {
      if (!cancelled) setPathDebug(d)
    })
    return () => {
      cancelled = true
    }
  }, [error, filePath])

  const previewTitle =
    pathKind === 'folder'
      ? 'פתח תיקייה'
      : truncateOneLine(
          error && pathDebug
            ? `${error} · ${compactPathDebugLine(pathDebug)}`
            : error
              ? error
              : loading
                ? 'טוען…'
                : 'תצוגה מקדימה',
          140
        )

  async function openFull() {
    if (pathKind === 'folder') {
      void window.api.openPath(filePath)
      return
    }
    if (error) {
      void requestThumb(true)
      return
    }
    try {
      const u = await window.api.getMediaUrl(filePath)
      setFullUrl(u)
      setOpen(true)
    } catch (e) {
      setError(humanizePreviewError((e as Error).message || String(e)))
    }
  }

  return (
    <>
      <div
        ref={ref}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'rgba(22, 33, 62, 0.6)',
          overflow: 'hidden',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          verticalAlign: 'middle'
        }}
        title={previewTitle}
        onClick={() => void openFull()}
      >
        {pathKind === 'folder' ? (
          <FolderPreviewGlyph pixelSize={Math.max(20, Math.round(size * 0.88))} />
        ) : thumbUrl ? (
          <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span className="muted small" style={{ fontSize: 8, textAlign: 'center', padding: 1, lineHeight: 1.1 }}>
            {error ? 'שוב' : loading ? '…' : ''}
          </span>
        )}
        {pathKind === 'file' && isVideoPath(filePath) && (
          <span
            style={{
              position: 'absolute',
              insetInlineEnd: 1,
              insetBlockEnd: 1,
              fontSize: 7,
              padding: '0 3px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'rgba(0,0,0,0.45)',
              lineHeight: 1.2
            }}
          >
            ▶
          </span>
        )}
      </div>

      {open &&
        fullUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: PREVIEW_OVERLAY_Z,
              padding: '1rem'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(900px, 92vw)',
                maxHeight: '85vh',
                background: 'rgba(22, 33, 62, 0.95)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <div className="toolbar" style={{ marginBottom: '0.35rem', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  סגור
                </button>
                {(isRasterImagePath(filePath) || isVideoPath(filePath)) && onOpenInWatermark && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onOpenInWatermark(filePath)
                      setOpen(false)
                    }}
                  >
                    סימן מים
                  </button>
                )}
                {isRasterImagePath(filePath) && onOpenInFaces && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onOpenInFaces(filePath)
                      setOpen(false)
                    }}
                  >
                    זיהוי פנים
                  </button>
                )}
                <span
                  className="muted small"
                  dir="ltr"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', unicodeBidi: 'isolate' }}
                >
                  {filePath}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%'
                }}
              >
                {isVideoPath(filePath) ? (
                  <video
                    src={fullUrl}
                    controls
                    style={{ maxWidth: '100%', maxHeight: 'min(72vh, calc(85vh - 5.5rem))', width: 'auto', height: 'auto' }}
                  />
                ) : (
                  <img
                    src={fullUrl}
                    alt=""
                    style={{
                      maxWidth: '100%',
                      maxHeight: 'min(72vh, calc(85vh - 5.5rem))',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain'
                    }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
