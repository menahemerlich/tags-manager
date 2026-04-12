import type { CSSProperties } from 'react'
import type { PathKind } from '../../../shared/types'

/** סגנון CSS עם משתני צבע לפי תיקיית תגיות */
export type FolderAccentStyle = CSSProperties & {
  '--folder-accent'?: string
  '--folder-accent-rgb'?: string
  '--folder-text'?: string
}

const FOLDER_COLOR_PALETTE = [
  { accent: '#22d3ee', accentRgb: '34, 211, 238', text: '#ecfeff' },
  { accent: '#8b5cf6', accentRgb: '139, 92, 246', text: '#f3e8ff' },
  { accent: '#10b981', accentRgb: '16, 185, 129', text: '#d1fae5' },
  { accent: '#f59e0b', accentRgb: '245, 158, 11', text: '#fef3c7' },
  { accent: '#ef4444', accentRgb: '239, 68, 68', text: '#fee2e2' },
  { accent: '#6366f1', accentRgb: '99, 102, 241', text: '#e0e7ff' },
  { accent: '#ec4899', accentRgb: '236, 72, 153', text: '#fce7f3' },
  { accent: '#84cc16', accentRgb: '132, 204, 22', text: '#ecfccb' },
  { accent: '#f97316', accentRgb: '249, 115, 22', text: '#ffedd5' },
  { accent: '#14b8a6', accentRgb: '20, 184, 166', text: '#ccfbf1' }
] as const

/** מחזיר סגנון הדגשה לפי מזהה תיקייה (צבע מהפלטה החוזרת) */
export function getFolderAccentStyle(folderId: number | null | undefined): FolderAccentStyle | undefined {
  if (folderId == null) return undefined
  const paletteEntry = FOLDER_COLOR_PALETTE[Math.abs(folderId) % FOLDER_COLOR_PALETTE.length]
  return {
    '--folder-accent': paletteEntry.accent,
    '--folder-accent-rgb': paletteEntry.accentRgb,
    '--folder-text': paletteEntry.text
  }
}

/** תווית בעברית לסוג פריט בספרייה (תיקייה / קובץ) */
export function kindHe(kind: PathKind): string {
  return kind === 'folder' ? 'תיקייה' : 'קובץ'
}
