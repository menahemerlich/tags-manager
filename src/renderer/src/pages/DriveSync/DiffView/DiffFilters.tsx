import { memo } from 'react'
import type { DiffShowFilter } from './filterTypes'

interface Props {
  show: DiffShowFilter
  setShow: (v: DiffShowFilter) => void
  searchTerm: string
  setSearchTerm: (v: string) => void
}

function DiffFiltersImpl({ show, setShow, searchTerm, setSearchTerm }: Props) {
  return (
    <div className="drive-sync-filters">
      <div className="drive-sync-filters-group" role="radiogroup" aria-label="סינון לפי סוג">
        <label>
          <input type="radio" checked={show === 'both'} onChange={() => setShow('both')} /> הכל
        </label>
        <label>
          <input type="radio" checked={show === 'files'} onChange={() => setShow('files')} /> קבצים
        </label>
        <label>
          <input type="radio" checked={show === 'folders'} onChange={() => setShow('folders')} />{' '}
          תיקיות
        </label>
      </div>
      <input
        type="search"
        className="drive-sync-search"
        placeholder="חיפוש בנתיב…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  )
}

export const DiffFilters = memo(DiffFiltersImpl)
