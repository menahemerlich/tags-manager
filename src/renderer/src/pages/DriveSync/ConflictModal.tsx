import { memo, useEffect, useState } from 'react'
import type {
  ConflictDecision,
  ConflictResponse,
  CopyConflictPrompt
} from '../../../../shared/driveSyncTypes'
import { formatBytes } from './DiffView/formatBytes'

interface Props {
  prompt: CopyConflictPrompt
  onResolve: (response: ConflictResponse) => void
}

function fmtMtime(ms?: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('he-IL')
  } catch {
    return '—'
  }
}

/** Modal shown when copying overwrites an existing file. Lets the user pick once or apply to all. */
function ConflictModalImpl({ prompt, onResolve }: Props) {
  const [applyToAll, setApplyToAll] = useState(false)

  const decide = (decision: ConflictDecision): void => {
    onResolve({ decision, applyToAll })
  }

  // Esc closes the modal as if the user picked "skip"; this matches the click-on-backdrop behaviour
  // and keeps the queue moving even if the user dismisses without choosing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') decide('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyToAll])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="התנגשות בהעתקה"
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) decide('skip')
      }}
    >
      <div className="overlay-card drive-sync-conflict-card">
        <h3 className="drive-sync-conflict-title">הקובץ כבר קיים ביעד</h3>
        <p className="drive-sync-conflict-path" dir="ltr">
          {prompt.job.relativePath}
        </p>

        <div className="drive-sync-conflict-meta">
          <span className="drive-sync-conflict-meta-label">קיים ביעד:</span>
          <span>
            {formatBytes(prompt.existingSize ?? 0)} · {fmtMtime(prompt.existingMtimeMs)}
          </span>
          <span className="drive-sync-conflict-meta-label">במקור:</span>
          <span>
            {formatBytes(prompt.sourceSize ?? 0)} · {fmtMtime(prompt.sourceMtimeMs)}
          </span>
        </div>

        <label className="drive-sync-conflict-checkbox">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          החל על כל ההתנגשויות הבאות
        </label>

        <div className="drive-sync-conflict-actions">
          <button type="button" className="drive-sync-action-btn" onClick={() => decide('skip')}>
            דלג
          </button>
          <button
            type="button"
            className="drive-sync-action-btn"
            onClick={() => decide('keep-both')}
          >
            שמור את שניהם
          </button>
          <button
            type="button"
            className="drive-sync-action-btn primary"
            onClick={() => decide('overwrite')}
          >
            החלף
          </button>
        </div>
      </div>
    </div>
  )
}

export const ConflictModal = memo(ConflictModalImpl)
