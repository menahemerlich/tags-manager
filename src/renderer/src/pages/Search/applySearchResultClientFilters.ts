import type { SearchResultRow } from '../../../../shared/types'
import {
  drivelessItemUnderScope,
  normalizePath,
  pathDrivelessKey,
  resolvePathForSearchScope
} from '../../../../shared/pathUtils'
import { classifySearchResultShape, type SearchResultShapeId } from './searchResultShapeFilter'

/** פרמטרים לסינון תוצאות חיפוש בצד הלקוח (אחרי IPC). */
export type SearchClientFilterOptions = {
  /** תחום נתיב אופציונלי מהמסך (כונן/תיקייה). */
  scopePath: string | null
  /**
   * קטגוריות נבחרות. ריק = אין סינון (הכל).
   * אם נבחר רק `folders` — רק תיקיות. אחרת — OR בין קטגוריות לקבצים; תיקיות לא מוצגות.
   */
  contentShapes: ReadonlySet<SearchResultShapeId>
}

/** האם נתיב התוצאה נמצא בתחום החיפוש שנבחר. */
function matchesScope(
  rowPath: string,
  scopePath: string | null,
  pathDriveless?: string | null
): boolean {
  if (!scopePath) return true
  const base = normalizePath(scopePath).replace(/[/\\]+$/, '')
  const sk = pathDrivelessKey(base)
  const rowDl = pathDriveless ?? pathDrivelessKey(normalizePath(rowPath))
  if (sk != null && rowDl != null) {
    return drivelessItemUnderScope(rowDl, sk)
  }
  const sep = base.includes('\\') ? '\\' : '/'
  const prefix = /[\\/]+$/.test(base) ? base : base + sep
  const rp = normalizePath(rowPath)
  const pathCmp = process.platform === 'win32' ? rp.toLowerCase() : rp
  const scopeCmp = process.platform === 'win32' ? base.toLowerCase() : base
  return pathCmp === scopeCmp || pathCmp.startsWith(prefix)
}

/**
 * מחיל סינון תחום + סינון צורת תוכן (תיקיות / תמונות / וידאו / מסמכים / אחר).
 */
export function applySearchResultClientFilters(
  rows: SearchResultRow[],
  opts: SearchClientFilterOptions
): SearchResultRow[] {
  const sel = opts.contentShapes
  const active = sel.size > 0
  const scope = opts.scopePath

  return rows
    .filter((row) => {
      if (!matchesScope(row.path, scope, row.pathDriveless)) return false
      if (!active) return true

      if (sel.has('folders')) {
        /** תיקיות בלבד — בלעדיות; אם בטעות נבחרו עוד דגלים, מתייחסים רק לתיקיות. */
        return row.kind === 'folder'
      }

      if (row.kind === 'folder') return false

      const shape = classifySearchResultShape(row.path, row.kind)
      return sel.has(shape)
    })
    .map((row) => {
      if (!scope) return row
      const resolved = resolvePathForSearchScope(scope, row.path, row.pathDriveless ?? null)
      if (resolved === row.path) return row
      return { ...row, path: resolved }
    })
}
