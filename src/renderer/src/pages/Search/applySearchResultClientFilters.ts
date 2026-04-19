import type { SearchResultRow } from '../../../../shared/types'
import { resolvePathForSearchScope } from '../../../../shared/pathUtils'
import { pathMatchesSearchScope } from '../../../../shared/searchScopeMatch'
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
      if (!pathMatchesSearchScope(row.path, scope, row.pathDriveless)) return false
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
