import { memo, useCallback, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { DiffRow, type DiffRowEntry } from './DiffRow'
import { useShiftSelection } from '../hooks/useShiftSelection'

export type DiffColumnVariant = 'only-a' | 'only-b' | 'differ'

interface Props {
  title: string
  variant: DiffColumnVariant
  entries: DiffRowEntry[]
  /** Selected keys; the parent owns this state so it can drive copy actions. */
  selected: Set<string>
  setSelected: (keys: Set<string>) => void
  /** Optional helper for "differ" column: a callback that returns secondary text per row. */
  secondaryFor?: (entry: DiffRowEntry) => string | undefined
  /** A unique scroll-id for Virtuoso to keep state per column. */
  scrollId?: string
  /** Total count for this bucket (may differ from `entries.length` when filters apply). */
  totalCount?: number
}

const VARIANT_ICON: Record<DiffColumnVariant, string> = {
  'only-a': '◀',
  'only-b': '▶',
  differ: '≠'
}

function DiffColumnImpl({
  title,
  variant,
  entries,
  selected,
  setSelected,
  secondaryFor,
  scrollId,
  totalCount
}: Props) {
  const keys = useMemo(() => entries.map((e) => e.relativePath), [entries])
  const { toggle } = useShiftSelection()

  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.relativePath))

  const onClickRow = useCallback(
    (index: number, shift: boolean) => {
      const next = toggle(keys, selected, index, shift)
      setSelected(next)
    },
    [keys, selected, setSelected, toggle]
  )

  const onSelectAll = useCallback(() => {
    if (allSelected) {
      const next = new Set(selected)
      for (const k of keys) next.delete(k)
      setSelected(next)
    } else {
      const next = new Set(selected)
      for (const k of keys) next.add(k)
      setSelected(next)
    }
  }, [allSelected, keys, selected, setSelected])

  const showCount = totalCount ?? entries.length
  const filteredOut = totalCount != null && totalCount !== entries.length

  return (
    <section className={`drive-sync-column ${variant}`} aria-label={title}>
      <header className="drive-sync-column-header">
        <span className="drive-sync-column-title">
          <span className="drive-sync-column-icon" aria-hidden>
            {VARIANT_ICON[variant]}
          </span>
          {title}
          <span className="drive-sync-column-count">
            {filteredOut
              ? `${entries.length.toLocaleString('he-IL')}/${showCount.toLocaleString('he-IL')}`
              : showCount.toLocaleString('he-IL')}
          </span>
        </span>
        <label className="drive-sync-column-select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            disabled={entries.length === 0}
          />
          בחר הכל
        </label>
      </header>
      <div className="drive-sync-column-list">
        {entries.length === 0 ? (
          <div className="drive-sync-column-empty">
            <span className="drive-sync-column-empty-icon" aria-hidden>
              {totalCount != null && totalCount > 0 ? '🔍' : '✓'}
            </span>
            {totalCount != null && totalCount > 0 ? 'אין התאמות לסינון' : 'אין פריטים'}
          </div>
        ) : (
          <Virtuoso
            data={entries}
            overscan={400}
            increaseViewportBy={{ top: 200, bottom: 400 }}
            computeItemKey={(_idx, item) => `${scrollId ?? title}:${item.relativePath}`}
            itemContent={(index, entry) => (
              <DiffRow
                entry={entry}
                index={index}
                selected={selected.has(entry.relativePath)}
                onClick={onClickRow}
                secondary={secondaryFor?.(entry)}
              />
            )}
          />
        )}
      </div>
    </section>
  )
}

export const DiffColumn = memo(DiffColumnImpl)
