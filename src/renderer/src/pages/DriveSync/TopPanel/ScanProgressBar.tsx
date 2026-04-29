import { memo } from 'react'
import type { ScanProgress } from '../../../../../shared/driveSyncTypes'

interface Props {
  progress: ScanProgress | null
  countsA?: number
  countsB?: number
  onCancel: () => void
}

function ScanProgressBarImpl({ progress, countsA, countsB, onCancel }: Props) {
  const phaseLabel = progress?.phase === 'hash' ? 'משווה hash' : 'סורק'
  const sideLabel = progress?.side === 'B' ? "ב'" : "א'"
  const scanned = progress?.scanned ?? 0
  const total = progress?.phase === 'hash' ? progress?.total ?? 0 : 0
  const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : null

  return (
    <div className="drive-sync-progress">
      <div className="drive-sync-progress-header">
        <div className="drive-sync-progress-status">
          {progress ? (
            <>
              {phaseLabel} צד {sideLabel}: <b>{scanned.toLocaleString('he-IL')}</b>
              {total > 0 ? <> / {total.toLocaleString('he-IL')}</> : null}
              {progress.currentPath ? (
                <span
                  className="drive-sync-progress-current"
                  dir="ltr"
                  title={progress.currentPath}
                >
                  {progress.currentPath}
                </span>
              ) : null}
            </>
          ) : (
            <>מתחיל…</>
          )}
        </div>
        <button type="button" className="drive-sync-action-btn danger" onClick={onCancel}>
          ביטול
        </button>
      </div>
      <div
        className="drive-sync-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={percent != null ? 100 : undefined}
        aria-valuenow={percent ?? undefined}
      >
        <div
          className={
            percent != null
              ? 'drive-sync-progress-bar-fill'
              : 'drive-sync-progress-bar-fill indeterminate'
          }
          style={percent != null ? { width: `${percent}%` } : undefined}
        />
      </div>
      {countsA != null || countsB != null ? (
        <div className="drive-sync-progress-counts">
          נסרקו עד כה: צד א' {countsA?.toLocaleString('he-IL') ?? '—'} | צד ב'{' '}
          {countsB?.toLocaleString('he-IL') ?? '—'}
        </div>
      ) : null}
    </div>
  )
}

export const ScanProgressBar = memo(ScanProgressBarImpl)
