import type { PathKind } from '../../../shared/types'

export type SmartSuggestModalState = {
  open: boolean
  items: { path: string; kind: PathKind }[]
  sampledFiles: string[]
  suggestions: { tag: string; score: number; reasons: string[] }[]
  accepted: Record<string, boolean>
}

export function SmartSuggestModal(props: {
  state: SmartSuggestModalState
  setState: (v: SmartSuggestModalState | ((prev: SmartSuggestModalState) => SmartSuggestModalState)) => void
  onApply: () => void | Promise<void>
  formatTagLabel: (name: string) => string
  getChipClassName: (tagName: string, isActive?: boolean) => string
}) {
  const { state, setState, onApply, formatTagLabel, getChipClassName } = props
  if (!state.open) return null

  const acceptAll = () =>
    setState((p) => {
      const next = { ...p.accepted }
      for (const s of p.suggestions) next[s.tag] = true
      return { ...p, accepted: next }
    })
  const rejectAll = () =>
    setState((p) => {
      const next = { ...p.accepted }
      for (const s of p.suggestions) next[s.tag] = false
      return { ...p, accepted: next }
    })

  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && setState((p) => ({ ...p, open: false }))}
    >
      <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <strong>הצעות תגיות (לוקאלי)</strong>
        <p className="muted small" style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}>
          נסרקו {state.sampledFiles.length} קבצים לדגימה. לא נשלח דבר לענן.
        </p>

        {state.sampledFiles.length > 0 && (
          <details style={{ marginBottom: '0.5rem' }}>
            <summary className="muted small">הקבצים שנדגמו</summary>
            <ul className="path-list" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
              {state.sampledFiles.map((p) => (
                <li key={p}>
                  <span className="path-cell">{p}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {state.suggestions.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            לא נמצאו הצעות.
          </p>
        ) : (
          <>
            <div className="toolbar" style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
              <button type="button" className="btn" onClick={acceptAll}>
                קבל הכל
              </button>
              <button type="button" className="btn" onClick={rejectAll}>
                דחה הכל
              </button>
            </div>

            <div className="chips">
              {state.suggestions.map((s) => {
                const isOn = !!state.accepted[s.tag]
                const scorePct = Math.round((s.score ?? 0) * 100)
                return (
                  <button
                    key={s.tag}
                    type="button"
                    className={getChipClassName(s.tag, isOn)}
                    onClick={() =>
                      setState((p) => ({ ...p, accepted: { ...p.accepted, [s.tag]: !p.accepted[s.tag] } }))
                    }
                    title={`${scorePct}%\n${(s.reasons ?? []).join(', ')}`}
                  >
                    {formatTagLabel(s.tag)} <span className="muted small">({scorePct}%)</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="toolbar" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <button type="button" className="btn primary" onClick={() => void onApply()}>
            החל תגיות שנבחרו
          </button>
          <button type="button" className="btn" onClick={() => setState((p) => ({ ...p, open: false }))}>
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}

