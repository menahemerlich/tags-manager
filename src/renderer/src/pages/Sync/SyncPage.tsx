import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ConflictRecord,
  SyncCheckResult,
  SyncProgressPayload,
  SyncSummary
} from '../../../../shared/types/sync.types'
import { ConflictCard } from './ConflictCard'

type Choice = 'keep-mine' | 'use-cloud'

type FeedbackTone = 'success' | 'error' | 'info'

type Feedback = {
  tone: FeedbackTone
  title: string
  detail?: string
}

const TABLE_LABELS: Record<string, string> = {
  tags: 'תגיות',
  paths: 'נתיבים',
  path_tags: 'קישורי נתיב–תגית',
  path_tag_exclusions: 'חריגות תגית לנתיב',
  tag_folders: 'תיקיות תגיות',
  tag_folder_tags: 'תגיות בתיקיות',
  face_people: 'אנשים (פנים)',
  face_embeddings: 'ייצוגי פנים',
  person_profiles: 'פרופילי אנשים'
}

function tableHe(id: string): string {
  return TABLE_LABELS[id] ?? id
}

function humanizeRemoteError(raw: string): string {
  const m = raw.toLowerCase()
  if (!raw.trim()) return 'שגיאה לא צפויה מול השרת.'
  if (m.includes('no handler registered')) {
    return 'נראה שהאפליקציה רצה עם build ישן/לא עודכן: לא נמצא handler ל־IPC של Supabase. סגור את האפליקציה, הרץ Clean Build, ואז הפעל מחדש.'
  }
  if (m.includes('blockbynetfree') || m.includes('blockby netfree') || m.includes('netfree')) {
    return 'הגישה ל-Supabase נחסמה ע"י NetFree/סינון רשת. הוסיפו ל-allowlist את הדומיין של הפרויקט (למשל: aizmozjvwnyevfqffuux.supabase.co). לאחר אישור, נסו שוב.'
  }
  if (m.includes('<!doctype html') || m.includes('bad gateway') || m.includes('error code 502')) {
    return 'Supabase/Cloudflare החזירו 502 (Bad Gateway). זו בדרך כלל תקלה זמנית בצד השרת או פרויקט לא זמין. נסו שוב בעוד דקה-שתיים.'
  }
  if (m.includes('jwt') || m.includes('invalid api') || m.includes('api key')) {
    return 'המפתח (anon / service) לא תקין או חסר הרשאות. בדקו ב-Supabase את מפתח ה-API.'
  }
  if (m.includes('relation') && m.includes('does not exist')) {
    return 'טבלאות ב-Supabase חסרות — הריצו את קובץ 001_initial_schema.sql בעורך ה-SQL של הפרויקט.'
  }
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to fetch') || m.includes('econnrefused')) {
    return 'אין גישה לשרת Supabase. בדקו חיבור לרשת, את כתובת ה-URL, ושהפרויקט פעיל.'
  }
  return raw
}

function FeedbackBox(props: { feedback: Feedback }) {
  const { tone, title, detail } = props.feedback
  return (
    <div
      className={`sync-feedback sync-feedback--${tone}`}
      role="status"
      aria-live="polite"
    >
      <p className="sync-feedback__title">{title}</p>
      {detail ? <p className="sync-feedback__body">{detail}</p> : null}
    </div>
  )
}

function formatCheckResult(r: SyncCheckResult): Feedback {
  if (!r.ok) {
    return {
      tone: 'error',
      title: 'בדיקת עדכונים נכשלה',
      detail: humanizeRemoteError(r.error ?? 'לא ניתן להשלים את הבדיקה.')
    }
  }
  if (r.upToDate) {
    return {
      tone: 'success',
      title: 'אין שינויים ממתינים',
      detail:
        'לפי חותמות הזמן האחרונות אין רשומות חדשות או מעודכנות לסנכרון — לא מקומית ולא בענן (או שעדיין לא בוצע דחיפה/משיכה ראשונה).'
    }
  }
  const lines = r.perTable.map((x) => `• ${tableHe(x.table)}: ${x.count} רשומות`).join('\n')
  return {
    tone: 'info',
    title: `נמצאו ${r.totalPending} רשומות לטיפול (מקומי + ענן)`,
    detail: `${lines}\n\nמומלץ: דחיפה אם השתנה המחשב המקומי, או משיכה אם השתנה הענן.`
  }
}

function formatPushResult(r: SyncSummary): Feedback {
  if (!r.ok) {
    const errTable = r.tables.find((t) => t.error)
    const hint = errTable
      ? `${tableHe(errTable.table)}: ${humanizeRemoteError(errTable.error ?? r.message ?? '')}`
      : humanizeRemoteError(r.message ?? '')
    return {
      tone: 'error',
      title: 'הדחיפה לענן נכשלה',
      detail: hint
    }
  }
  const total = r.tables.reduce((s, t) => s + (t.pushed ?? 0), 0)
  const lines = r.tables
    .map((t) => {
      const n = t.pushed ?? 0
      return `• ${tableHe(t.table)}: ${n} רשומות נשלחו`
    })
    .join('\n')
  const stamp = r.lastOperationAt ? `\n\nחותמת סיום: ${r.lastOperationAt}` : ''
  return {
    tone: 'success',
    title:
      total === 0
        ? 'הדחיפה הושלמה — אין רשומות חדשות מאז הדחיפה הקודמת'
        : `הדחיפה הצליחה — סה״כ ${total} רשומות נשלחו ל-Supabase`,
    detail: lines + stamp
  }
}

function formatPullResult(r: SyncSummary): Feedback {
  if (!r.ok) {
    return {
      tone: 'error',
      title: 'המשיכה מהענן נכשלה',
      detail: humanizeRemoteError(r.message ?? 'שגיאה לא ידועה.')
    }
  }
  const lines = r.tables
    .map((t) => {
      const pulled = t.pulled ?? 0
      const conflicts = t.conflicts ?? 0
      const skipped = t.skipped ?? 0
      return `• ${tableHe(t.table)}: עודכנו/נוספו ${pulled}, דולגו ${skipped}, קונפליקטים ${conflicts}`
    })
    .join('\n')
  const anyConflicts = r.tables.some((t) => (t.conflicts ?? 0) > 0)
  const stamp = r.lastOperationAt ? `\n\nחותמת סיום: ${r.lastOperationAt}` : ''
  return {
    tone: anyConflicts ? 'info' : 'success',
    title: anyConflicts
      ? 'המשיכה הושלמה — יש קונפליקטים שדורשים החלטה (ראו למטה)'
      : 'המשיכה מהענן הושלמה בהצלחה',
    detail: lines + stamp
  }
}

export default function SyncPage() {
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [lastPushAt, setLastPushAt] = useState<string | undefined>()
  const [lastPullAt, setLastPullAt] = useState<string | undefined>()
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [pendingCount, setPendingCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<SyncProgressPayload | null>(null)
  /** הודעות קצרות לפעולות הגדרות / קונפליקטים */
  const [actionFeedback, setActionFeedback] = useState<Feedback | null>(null)
  /** סיכום בדיקה / דחיפה / משיכה */
  const [operationFeedback, setOperationFeedback] = useState<Feedback | null>(null)
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([])
  const [choices, setChoices] = useState<Record<string, Choice>>({})

  const refreshStatus = useCallback(async () => {
    try {
      const st = await window.api.supabaseSyncStatus()
      setLastPushAt(st.lastPushAt)
      setLastPullAt(st.lastPullAt)
      setDeviceId(st.deviceId)
      setPendingCount(st.pendingConflicts)
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'לא ניתן לטעון סטטוס סנכרון',
        detail: humanizeRemoteError((e as Error).message)
      })
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.api.getSettings()
      setSupabaseUrl(s.sync?.supabaseUrl ?? '')
      setSupabaseAnonKey(s.sync?.supabaseAnonKey ?? '')
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'טעינת הגדרות נכשלה',
        detail: humanizeRemoteError((e as Error).message)
      })
    }
  }, [])

  const loadConflicts = useCallback(async () => {
    try {
      const { conflicts: list } = await window.api.supabaseSyncReadConflicts()
      setConflicts(list)
      setChoices((prev) => {
        const next = { ...prev }
        for (const c of list) {
          if (next[c.id] === undefined) next[c.id] = 'keep-mine'
        }
        return next
      })
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'לא ניתן לטעון רשימת קונפליקטים',
        detail: humanizeRemoteError((e as Error).message)
      })
    }
  }, [])

  useEffect(() => {
    void loadSettings()
    void refreshStatus()
    void loadConflicts()
  }, [loadSettings, refreshStatus, loadConflicts])

  useEffect(() => {
    const off = window.api.onSupabaseSyncProgress((p) => {
      setProgress(p)
      if (p.stage === 'done' || p.stage === 'error') {
        setTimeout(() => setProgress(null), 1500)
      }
    })
    return off
  }, [])

  const overallPercent = useMemo(() => {
    if (!progress?.overallTotal || progress.overallTotal <= 0) return 0
    const d = progress.overallDone ?? 0
    return Math.max(0, Math.min(100, Math.round((d / progress.overallTotal) * 100)))
  }, [progress])

  const tablePercent = useMemo(() => {
    if (!progress?.tableTotal || progress.tableTotal <= 0) return 0
    const d = progress.tableDone ?? 0
    return Math.max(0, Math.min(100, Math.round((d / progress.tableTotal) * 100)))
  }, [progress])

  function requireCredentials(): boolean {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setOperationFeedback({
        tone: 'error',
        title: 'חסרים פרטי חיבור',
        detail: 'מלאו Supabase URL ומפתח API (שמורו אם צריך), ואז נסו שוב.'
      })
      return false
    }
    return true
  }

  async function saveCredentials() {
    setActionFeedback(null)
    setBusy(true)
    try {
      if (!supabaseUrl.trim()) {
        setActionFeedback({
          tone: 'error',
          title: 'שמירה נכשלה',
          detail: 'כתובת Supabase (URL) לא יכולה להיות ריקה.'
        })
        return
      }
      const s = await window.api.getSettings()
      await window.api.setSettings({
        ...s,
        sync: { ...s.sync, supabaseUrl: supabaseUrl.trim(), supabaseAnonKey: supabaseAnonKey.trim() }
      })
      setActionFeedback({
        tone: 'success',
        title: 'ההגדרות נשמרו בהצלחה',
        detail: 'ניתן כעת לבצע בדיקת חיבור או דחיפה/משיכה.'
      })
      await refreshStatus()
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'שמירת ההגדרות נכשלה',
        detail: (e as Error).message
      })
    } finally {
      setBusy(false)
    }
  }

  async function testConnection() {
    setActionFeedback(null)
    setBusy(true)
    try {
      if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
        setActionFeedback({
          tone: 'error',
          title: 'בדיקת חיבור נכשלה',
          detail: 'מלאו URL ומפתח לפני הבדיקה.'
        })
        return
      }
      const s = await window.api.getSettings()
      await window.api.setSettings({
        ...s,
        sync: { ...s.sync, supabaseUrl: supabaseUrl.trim(), supabaseAnonKey: supabaseAnonKey.trim() }
      })
      const r = await window.api.supabaseSyncTestConnection()
      if (r.ok) {
        setActionFeedback({
          tone: 'success',
          title: 'החיבור ל-Supabase תקין',
          detail: 'הגישה לטבלת tags אושרה. ודאו שגם שאר המיגרציה הורצה בפרויקט.'
        })
      } else {
        setActionFeedback({
          tone: 'error',
          title: 'החיבור נכשל',
          detail: humanizeRemoteError(r.error ?? 'לא ידוע.')
        })
      }
      await refreshStatus()
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'בדיקת חיבור נכשלה',
        detail: humanizeRemoteError((e as Error).message)
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyMigrationSql() {
    setActionFeedback(null)
    try {
      const r = await window.api.supabaseSyncReadMigrationSql()
      if (!r.ok || !r.sql) {
        setActionFeedback({
          tone: 'error',
          title: 'לא ניתן להעתיק מיגרציה',
          detail: r.error ?? 'קובץ SQL לא נמצא.'
        })
        return
      }
      await navigator.clipboard.writeText(r.sql)
      setActionFeedback({
        tone: 'success',
        title: 'המיגרציה הועתקה ללוח',
        detail: 'הדביקו ב-SQL Editor של Supabase והריצו.'
      })
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'ההעתקה ללוח נכשלה',
        detail: (e as Error).message || 'ייתכן שהדפדפן חוסם גישה ללוח — נסו ידנית.'
      })
    }
  }

  async function resetState() {
    if (!window.confirm('לאפס חותמות סנכרון ולמחוק רשימת קונפליקטים ממתינים?')) return
    setBusy(true)
    setActionFeedback(null)
    try {
      const r = await window.api.supabaseSyncResetState()
      if (r.ok) {
        setActionFeedback({
          tone: 'success',
          title: 'מצב הסנכרון אופס',
          detail: 'חותמות דחיפה/משיכה נמחקו ורשימת הקונפליקטים התרוקנה. בפעם הבאה סנכרון ייחשב מחדש.'
        })
      } else {
        setActionFeedback({
          tone: 'error',
          title: 'איפוס נכשל',
          detail: r.error ?? 'שגיאה לא ידועה.'
        })
      }
      await refreshStatus()
      await loadConflicts()
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'איפוס נכשל',
        detail: (e as Error).message
      })
    } finally {
      setBusy(false)
    }
  }

  async function runCheck() {
    if (!requireCredentials()) return
    setBusy(true)
    setOperationFeedback(null)
    try {
      const r = await window.api.supabaseSyncCheck()
      setOperationFeedback(formatCheckResult(r))
    } catch (e) {
      setOperationFeedback({
        tone: 'error',
        title: 'בדיקה נכשלה',
        detail: humanizeRemoteError((e as Error).message)
      })
    } finally {
      setBusy(false)
    }
  }

  async function runPush() {
    if (!requireCredentials()) return
    setBusy(true)
    setOperationFeedback(null)
    try {
      const r = await window.api.supabaseSyncPush()
      setOperationFeedback(formatPushResult(r))
      await refreshStatus()
    } catch (e) {
      setOperationFeedback({
        tone: 'error',
        title: 'דחיפה נכשלה',
        detail: humanizeRemoteError((e as Error).message)
      })
    } finally {
      setBusy(false)
    }
  }

  async function runPull() {
    if (!requireCredentials()) return
    setBusy(true)
    setOperationFeedback(null)
    try {
      const r = await window.api.supabaseSyncPull()
      setOperationFeedback(formatPullResult(r))
      await refreshStatus()
      await loadConflicts()
    } catch (e) {
      setOperationFeedback({
        tone: 'error',
        title: 'משיכה נכשלה',
        detail: humanizeRemoteError((e as Error).message)
      })
    } finally {
      setBusy(false)
    }
  }

  async function applyResolutions() {
    const resolutions = conflicts.map((c) => ({
      id: c.id,
      choice: choices[c.id] ?? ('keep-mine' as Choice)
    }))
    if (resolutions.length === 0) return
    setBusy(true)
    setActionFeedback(null)
    try {
      const r = await window.api.supabaseSyncResolveConflicts(resolutions)
      if (!r.ok) {
        setActionFeedback({
          tone: 'error',
          title: 'יישום ההחלטות נכשל',
          detail: humanizeRemoteError(r.error ?? '')
        })
        return
      }
      setActionFeedback({
        tone: 'success',
        title: 'ההחלטות יושמו בהצלחה',
        detail: 'הנתונים המקומיים עודכנו לפי הבחירה (שמירה מקומית / שימוש בענן).'
      })
      await loadConflicts()
      await refreshStatus()
    } catch (e) {
      setActionFeedback({
        tone: 'error',
        title: 'יישום ההחלטות נכשל',
        detail: (e as Error).message
      })
    } finally {
      setBusy(false)
    }
  }

  function setChoice(id: string, choice: Choice) {
    setChoices((prev) => ({ ...prev, [id]: choice }))
  }

  function bulkSet(choice: Choice) {
    setChoices((prev) => {
      const next = { ...prev }
      for (const c of conflicts) next[c.id] = choice
      return next
    })
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>סנכרון Supabase</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        סנכרון שורתי ידני: דחיפה ומשיכה לפי <code>updated_at</code>. התנגשויות נשמרות בקובץ pending_conflicts.json ומוצגות
        כאן.
      </p>

      <div className="field">
        <label htmlFor="sb-url">Supabase URL</label>
        <input
          id="sb-url"
          value={supabaseUrl}
          onChange={(e) => setSupabaseUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="sb-key">מפתח anon (או service role)</label>
        <input
          id="sb-key"
          type="password"
          value={supabaseAnonKey}
          onChange={(e) => setSupabaseAnonKey(e.target.value)}
          placeholder="eyJ..."
          autoComplete="off"
        />
      </div>
      <div className="toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void saveCredentials()}>
          שמור הגדרות
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void testConnection()}>
          בדיקת חיבור
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void copyMigrationSql()}>
          העתק SQL מיגרציה
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void resetState()}>
          איפוס מצב סנכרון
        </button>
      </div>

      {actionFeedback ? <FeedbackBox feedback={actionFeedback} /> : null}

      <div className="muted small" style={{ marginBottom: '1rem' }}>
        <div>דחיפה אחרונה: {lastPushAt ?? '—'}</div>
        <div>משיכה אחרונה: {lastPullAt ?? '—'}</div>
        <div>מזהה מכשיר: {deviceId ?? '—'}</div>
        <div>קונפליקטים ממתינים: {pendingCount}</div>
      </div>

      {progress ? (
        <div className="sync-progress">
          <div className="sync-progress__row muted small">
            <div>
              <strong>{progress.operation === 'push' ? 'דחיפה' : progress.operation === 'pull' ? 'משיכה' : 'סנכרון'}</strong>
              {progress.message ? ` — ${progress.message}` : ''}
            </div>
            <div>
              סה״כ: {progress.overallDone ?? 0}/{progress.overallTotal ?? 0} ({overallPercent}%)
            </div>
          </div>
          {progress.table ? (
            <div className="sync-progress__row muted small" style={{ marginTop: '0.35rem' }}>
              <div>
                טבלה: <strong>{tableHe(progress.table)}</strong>
              </div>
              <div>
                {progress.tableDone ?? 0}/{progress.tableTotal ?? 0} ({tablePercent}%)
              </div>
            </div>
          ) : null}
          <div className="sync-progress__bar" aria-hidden="true">
            <div className="sync-progress__fill" style={{ width: `${overallPercent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="toolbar" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void runCheck()}>
          בדוק שינויים
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void runPush()}>
          דחיפה (Push)
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void runPull()}>
          משיכה (Pull)
        </button>
      </div>

      {operationFeedback ? <FeedbackBox feedback={operationFeedback} /> : null}

      <h3 style={{ marginTop: '1.5rem' }}>קונפליקטים</h3>
      {conflicts.length === 0 ? (
        <p className="muted small">אין קונפליקטים ממתינים.</p>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="btn" disabled={busy} onClick={() => bulkSet('keep-mine')}>
              סמן הכל: שמור מקומי
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => bulkSet('use-cloud')}>
              סמן הכל: ענן
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void applyResolutions()}>
              החל החלטות
            </button>
          </div>
          {conflicts.map((c) => (
            <ConflictCard key={c.id} conflict={c} choice={choices[c.id] ?? null} onChoice={setChoice} />
          ))}
        </>
      )}
    </section>
  )
}
