import type { CSSProperties, ReactNode } from 'react'

export type TagFolderCardFolder = {
  id: number
  name: string
  tagIds: number[]
}

type TagFolderCardProps = {
  folder: TagFolderCardFolder
  expanded: boolean
  accentStyle?: CSSProperties
  onToggle: () => void
  /** פעולות נוספות (למשל עריכה / מחיקה) — רק בטאב תגיות */
  menu?: ReactNode
}

function FolderIcon() {
  return (
    <svg
      className="folder-chip-glyph"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7.5V6a2 2 0 012-2h4.5l1.5 2H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-8.5z" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`folder-chip-chevron-svg${open ? ' is-open' : ''}`}
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** כרטיס תיקיית תגיות: תיבה אחת — פתיחה/סגירה, ובטאב תגיות גם עריכה/מחיקה בפנים. */
export function TagFolderCard({ folder, expanded, accentStyle, onToggle, menu }: TagFolderCardProps) {
  const count = folder.tagIds?.length ?? 0
  return (
    <div
      className={`folder-chip-wrap${expanded ? ' on' : ''}`}
      style={accentStyle}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="folder-chip-toggle"
        title={`תגיות בתיקייה: ${count}`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <FolderIcon />
        <span className="folder-chip-name">{folder.name}</span>
        <span className="folder-chip-badge">{count}</span>
        <ChevronIcon open={expanded} />
      </button>
      {menu}
    </div>
  )
}
