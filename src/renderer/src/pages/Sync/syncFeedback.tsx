import type { SyncCheckResult, SyncSummary } from '../../../../shared/types/sync.types'

export type FeedbackTone = 'success' | 'error' | 'info'

export type Feedback = {
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

/** שם תצוגה בעברית לשם טבלה טכני מ-Supabase */
export function tableHe(id: string): string {
  return TABLE_LABELS[id] ?? id
}

/** הופך הודעות שגיאה גולמיות מהרשת להסבר קריא בעברית */
export function humanizeRemoteError(raw: string): string {
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

/** תיבת משוב צבעונית לפי סוג (הצלחה / שגיאה / מידע) */
export function FeedbackBox(props: { feedback: Feedback }) {
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

export function formatCheckResult(r: SyncCheckResult): Feedback {
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

export function formatPushResult(r: SyncSummary): Feedback {
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

export function formatPullResult(r: SyncSummary): Feedback {
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
