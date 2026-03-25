import type { ConflictRecord } from '../../../../shared/types/sync.types'

type Choice = 'keep-mine' | 'use-cloud'

export function ConflictCard(props: {
  conflict: ConflictRecord
  choice: Choice | null
  onChoice: (id: string, choice: Choice) => void
}) {
  const { conflict, choice, onChoice } = props
  return (
    <div
      className="field"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.75rem',
        marginBottom: '0.75rem',
        background: 'rgba(26, 26, 46, 0.35)'
      }}
    >
      <p style={{ margin: '0 0 0.35rem 0', fontWeight: 600 }}>
        {conflict.table} · {conflict.recordKey}
      </p>
      <p className="muted small" style={{ margin: '0 0 0.5rem 0' }}>
        מקומי: {conflict.localUpdatedAt} · ענן: {conflict.cloudUpdatedAt}
      </p>
      <details style={{ marginBottom: '0.5rem' }}>
        <summary className="muted small" style={{ cursor: 'pointer' }}>
          פרטי רשומות (JSON)
        </summary>
        <pre
          className="muted small"
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 160,
            overflow: 'auto',
            margin: '0.35rem 0 0 0'
          }}
        >
          {JSON.stringify({ local: conflict.localRow, cloud: conflict.cloudRow }, null, 2)}
        </pre>
      </details>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name={`c-${conflict.id}`}
            checked={choice === 'keep-mine'}
            onChange={() => onChoice(conflict.id, 'keep-mine')}
          />
          שמור מקומי
        </label>
        <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name={`c-${conflict.id}`}
            checked={choice === 'use-cloud'}
            onChange={() => onChoice(conflict.id, 'use-cloud')}
          />
          השתמש בענן
        </label>
      </div>
    </div>
  )
}
