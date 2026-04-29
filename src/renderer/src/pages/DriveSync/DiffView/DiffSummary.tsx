import { memo } from 'react'

interface Props {
  onlyA: number
  onlyB: number
  differ: number
  scannedA?: number
  scannedB?: number
  elapsedMs?: number | null
}

function DiffSummaryImpl({ onlyA, onlyB, differ, scannedA, scannedB, elapsedMs }: Props) {
  const fmt = (n: number): string => n.toLocaleString('he-IL')
  const totalDiff = onlyA + onlyB + differ
  return (
    <div className="drive-sync-summary" role="status">
      <span className="drive-sync-summary-pill only-a">
        רק בא': <b>{fmt(onlyA)}</b>
      </span>
      <span className="drive-sync-summary-pill differ">
        שונים: <b>{fmt(differ)}</b>
      </span>
      <span className="drive-sync-summary-pill only-b">
        רק בב': <b>{fmt(onlyB)}</b>
      </span>
      {scannedA != null && scannedB != null ? (
        <span className="drive-sync-summary-pill muted">
          נסרקו: א' {fmt(scannedA)} · ב' {fmt(scannedB)}
        </span>
      ) : null}
      {elapsedMs != null ? (
        <span className="drive-sync-summary-pill muted">
          זמן סריקה: {(elapsedMs / 1000).toFixed(1)} ש'
        </span>
      ) : null}
      {totalDiff === 0 && scannedA != null && scannedB != null ? (
        scannedA === 0 && scannedB === 0 ? (
          <div className="drive-sync-empty-banner" role="alert">
            ⚠ לא נסרק אף קובץ בשתי התיקיות — ודא שהנתיבים נכונים ושיש גישה לתיקיות.
          </div>
        ) : scannedA !== scannedB ? (
          <div className="drive-sync-empty-banner" role="alert">
            ⚠ לא נמצאו הבדלים אך מספרי הקבצים שונים ({fmt(scannedA)} מול {fmt(scannedB)}) — ייתכן
            שהשמות זהים. נסה מצב "מדויקת".
          </div>
        ) : (
          <div className="drive-sync-empty-banner">
            ✓ התיקיות זהות — אין הבדלים בין הצדדים (לפי שם וגודל).
          </div>
        )
      ) : null}
    </div>
  )
}

export const DiffSummary = memo(DiffSummaryImpl)
