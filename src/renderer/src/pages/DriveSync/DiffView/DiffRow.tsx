import { memo, type MouseEvent } from 'react'
import { formatBytes } from './formatBytes'

export interface DiffRowEntry {
  relativePath: string
  size: number
  isFile: boolean
}

interface Props {
  entry: DiffRowEntry
  index: number
  selected: boolean
  onClick: (index: number, shift: boolean) => void
  /** Optional secondary text (e.g. "size: 1.2 MB ↔ 1.2 MB"). */
  secondary?: string
}

function DiffRowImpl({ entry, index, selected, onClick, secondary }: Props) {
  const handleClick = (e: MouseEvent<HTMLLabelElement>): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    onClick(index, e.shiftKey)
  }

  return (
    <label
      onClick={handleClick}
      className={selected ? 'drive-sync-row selected' : 'drive-sync-row'}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => {
          const native = e.nativeEvent as unknown as { shiftKey?: boolean }
          onClick(index, native.shiftKey === true)
        }}
        aria-label={`סמן ${entry.relativePath}`}
      />
      <span aria-hidden className="drive-sync-row-icon">
        {entry.isFile ? '📄' : '📁'}
      </span>
      <span className="drive-sync-row-path" dir="ltr" title={entry.relativePath}>
        {entry.relativePath}
      </span>
      {entry.isFile ? (
        <span className="drive-sync-row-meta">{formatBytes(entry.size)}</span>
      ) : null}
      {secondary ? <span className="drive-sync-row-meta">{secondary}</span> : null}
    </label>
  )
}

export const DiffRow = memo(DiffRowImpl)
