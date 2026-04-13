import type { PathKind } from '../../../../shared/types'

/** קטגוריות לסינון תוצאות חיפוש (תיקיות או סוגי קבצים). */
export type SearchResultShapeId = 'folders' | 'images' | 'video' | 'documents' | 'other'

/** סדר תצוגה בתיבות הסימון. */
export const SEARCH_RESULT_SHAPE_ORDER: readonly SearchResultShapeId[] = [
  'folders',
  'images',
  'video',
  'documents',
  'other'
] as const

export const SEARCH_RESULT_SHAPE_LABEL: Record<SearchResultShapeId, string> = {
  folders: 'תיקיות',
  images: 'תמונות',
  video: 'וידאו',
  documents: 'מסמכים',
  other: 'אחר'
}

/** ברירת מחדל: אין סינון (הכל). */
export function createEmptySearchResultShapeSelection(): Set<SearchResultShapeId> {
  return new Set()
}

function isVideoPath(filePath: string): boolean {
  const p = filePath.toLowerCase()
  return ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'].some((ext) => p.endsWith(ext))
}

function isRasterImagePath(filePath: string): boolean {
  if (isVideoPath(filePath)) return false
  const base = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  const m = base.match(/\.([^.]+)$/)
  if (!m) return false
  return /^(jpe?g|png|gif|webp|bmp|avif|heic|heif|tiff?)$/.test(m[1])
}

/** מסמכים נפוצים (משרד + טקסט + מצגות) לפי סיומת. */
function isDocumentPath(filePath: string): boolean {
  if (isVideoPath(filePath) || isRasterImagePath(filePath)) return false
  const base = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  const m = base.match(/\.([^.]+)$/)
  if (!m) return false
  return /^(pdf|doc|docx|dot|dotx|rtf|odt|ods|odp|xls|xlsx|xlsm|xlsb|csv|tsv|txt|md|epub|ppt|pptx|pps|ppsx|potx|html?|xml|json|pages|key|numbers)$/.test(
    m[1]
  )
}

/**
 * מסווג שורת תוצאה לקטגוריית סינון אחת.
 * לקבצים: וידאו → תמונה → מסמך → אחר (לפי סיומת).
 */
export function classifySearchResultShape(path: string, kind: PathKind): SearchResultShapeId {
  if (kind === 'folder') return 'folders'
  if (isVideoPath(path)) return 'video'
  if (isRasterImagePath(path)) return 'images'
  if (isDocumentPath(path)) return 'documents'
  return 'other'
}
