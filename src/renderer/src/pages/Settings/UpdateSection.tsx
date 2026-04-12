import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateFeedMessage } from '../../../../shared/types/update.types'

/** אזור הגדרות עדכוני אפליקציה (בדיקה, הורדה, התקנה) */
export default function UpdateSection() {
  const [version, setVersion] = useState('')
  /** false until main reports — avoids enabling "Check" in dev before status loads. */
  const [isPackaged, setIsPackaged] = useState(false)
  const [checking, setChecking] = useState(false)
  const [downloadPct, setDownloadPct] = useState<number | null>(null)
  const [downloadActive, setDownloadActive] = useState(false)
  const [inlineOk, setInlineOk] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [reloadBusy, setReloadBusy] = useState(false)
  const [reloadOk, setReloadOk] = useState(false)
  const [reloadError, setReloadError] = useState<string | null>(null)
  const okTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reloadOkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearOkTimer = useCallback(() => {
    if (okTimerRef.current) {
      clearTimeout(okTimerRef.current)
      okTimerRef.current = null
    }
  }, [])

  const clearReloadOkTimer = useCallback(() => {
    if (reloadOkTimerRef.current) {
      clearTimeout(reloadOkTimerRef.current)
      reloadOkTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    void window.api.getUpdateStatus().then((s) => {
      setVersion(s.version)
      setIsPackaged(s.isPackaged)
    })
  }, [])

  useEffect(() => {
    return window.api.onUpdateFeed((msg: UpdateFeedMessage) => {
      switch (msg.type) {
        case 'manual-check-finished':
          setChecking(false)
          if (msg.result === 'up-to-date') {
            setInlineError(null)
            setInlineOk(true)
            clearOkTimer()
            okTimerRef.current = setTimeout(() => {
              setInlineOk(false)
              okTimerRef.current = null
            }, 3000)
          } else if (msg.result === 'error') {
            setInlineOk(false)
            setInlineError(msg.message)
          } else if (msg.result === 'update-prompt-shown') {
            setInlineError(null)
          }
          break
        case 'download-progress':
          setDownloadPct(Math.round(msg.percent))
          break
        case 'download-active':
          setDownloadActive(msg.active)
          if (!msg.active) {
            setDownloadPct(null)
          }
          break
        default:
          break
      }
    })
  }, [clearOkTimer])

  async function handleCheck(): Promise<void> {
    setInlineOk(false)
    setInlineError(null)
    const status = await window.api.getUpdateStatus()
    if (!status.isPackaged) {
      setInlineError('עדכונים זמינים רק בגרסה המותקנת.')
      return
    }
    setChecking(true)
    try {
      const r = await window.api.checkForUpdatesManual()
      if (!r.ok && 'reason' in r) {
        setChecking(false)
        if (r.reason === 'dev') {
          setInlineError('עדכונים זמינים רק בגרסה המותקנת.')
        } else {
          setInlineError('שירות העדכונים לא זמין.')
        }
        return
      }
      if (!r.ok && 'error' in r) {
        setChecking(false)
        setInlineError(r.error.length > 0 ? r.error : 'אירעה שגיאה בלתי צפויה. נסה שנית.')
        return
      }
    } catch {
      setChecking(false)
      setInlineError('אירעה שגיאה בלתי צפויה. נסה שנית.')
    }
  }

  async function handleReloadUserData(): Promise<void> {
    setReloadOk(false)
    setReloadError(null)
    clearReloadOkTimer()
    setReloadBusy(true)
    try {
      const r = await window.api.reloadUserData()
      if (!r.ok) {
        setReloadError(r.error.length > 0 ? r.error : 'טעינה מחדש נכשלה.')
        return
      }
      setReloadOk(true)
      reloadOkTimerRef.current = setTimeout(() => {
        setReloadOk(false)
        reloadOkTimerRef.current = null
      }, 4000)
      window.dispatchEvent(new CustomEvent('tags-manager:user-data-reloaded'))
    } catch (e) {
      setReloadError(e instanceof Error ? e.message : 'אירעה שגיאה בלתי צפויה.')
    } finally {
      setReloadBusy(false)
    }
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: '0.75rem' }}>
        גרסה נוכחית: <strong>{version || '…'}</strong>
      </p>
      {!isPackaged && (
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          עדכונים זמינים רק בגרסה המותקנת (לא במצב פיתוח).
        </p>
      )}
      <div className="toolbar">
        <button
          type="button"
          className="btn"
          disabled={checking || !isPackaged}
          onClick={() => void handleCheck()}
        >
          {checking ? 'בודק עדכונים…' : 'בדוק עדכונים'}
        </button>
      </div>
      {downloadActive && (
        <div style={{ marginTop: '0.75rem', maxWidth: 360 }}>
          <p className="muted small" style={{ marginBottom: '0.35rem' }}>
            מוריד עדכון… {downloadPct ?? 0}%
          </p>
          <div
            style={{
              height: 8,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 4,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, downloadPct ?? 0))}%`,
                height: '100%',
                background: 'var(--accent, #6c9)',
                transition: 'width 0.2s ease'
              }}
            />
          </div>
        </div>
      )}
      {inlineOk && (
        <p className="muted small" style={{ marginTop: '0.75rem', color: 'var(--success, #8c8)' }}>
          האפליקציה מעודכנת ✓
        </p>
      )}
      {inlineError && (
        <p className="muted small" style={{ marginTop: '0.75rem', color: 'var(--danger, #c88)' }}>
          {inlineError}
        </p>
      )}
      <div
        style={{
          marginTop: '1rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.75rem'
        }}
      >
        <p className="muted small" style={{ marginBottom: '0.5rem' }}>
          <strong>נתונים מהדיסק:</strong> אם העתקת ידנית את <code>tags-manager.sqlite</code> או{' '}
          <code>settings.json</code> לתיקיית הנתונים של האפליקציה, לחץ כדי לטעון מחדש בלי לסגור את
          התוכנה.
        </p>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            disabled={reloadBusy}
            onClick={() => void handleReloadUserData()}
          >
            {reloadBusy ? 'טוען מחדש…' : 'טען מחדש נתונים מהדיסק'}
          </button>
        </div>
        {reloadBusy && (
          <p className="muted small" style={{ marginTop: '0.5rem' }}>
            קורא את מסד הנתונים מהקובץ…
          </p>
        )}
        {reloadOk && !reloadBusy && (
          <p className="muted small" style={{ marginTop: '0.5rem', color: 'var(--success, #8c8)' }}>
            הנתונים נטענו מחדש ✓
          </p>
        )}
        {reloadError && (
          <p className="muted small" style={{ marginTop: '0.5rem', color: 'var(--danger, #c88)' }}>
            {reloadError}
          </p>
        )}
      </div>
      <p className="muted small" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        <strong>כוננים חיצוניים:</strong> הנתיבים נשמרים כמוחלטים (כולל אות כונן). אם דיסק USB מקבל אות
        אחר, ייתכן שתצטרכו לבחור מחדש או להוסיף שוב את התיקיות — תכונה להחלפת נתיב גלובלית תתווסף
        בעתיד אם יידרש.
      </p>
    </>
  )
}
