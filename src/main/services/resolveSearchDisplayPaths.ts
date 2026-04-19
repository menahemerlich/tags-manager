import { existsSync } from 'node:fs'
import type { SearchResultRow } from '../../shared/types'
import { normalizePath, pathDrivelessKey, windowsAbsoluteFromDriveLetter } from '../../shared/pathUtils'
import { tryResolveMediaFsPath } from './media/resolveMediaFsPath'

/**
 * מתאים נתיבי תוצאות חיפוש לכונן שבו הקבצים באמת קיימים (אות כונן אחרת, אותו זנב לוגי).
 * ממומא לפי path_driveless כדי לא לבצע 26 בדיקות לכל שורה.
 */
export function resolveSearchResultRowsDisplayPaths(rows: SearchResultRow[]): SearchResultRow[] {
  const letterByDriveless = new Map<string, string | null>()

  const letterForDriveless = (dl: string): string | null => {
    if (letterByDriveless.has(dl)) return letterByDriveless.get(dl) ?? null
    for (let i = 0; i < 26; i++) {
      const L = String.fromCharCode(65 + i)
      const candidate = windowsAbsoluteFromDriveLetter(L, dl)
      try {
        if (existsSync(candidate)) {
          letterByDriveless.set(dl, L)
          return L
        }
      } catch {
        continue
      }
    }
    letterByDriveless.set(dl, null)
    return null
  }

  return rows.map((row) => {
    const hit = tryResolveMediaFsPath(row.path)
    if (hit) return { ...row, path: hit }
    const norm = normalizePath(row.path)
    try {
      if (existsSync(norm)) return { ...row, path: norm }
    } catch {
      /* ignore */
    }
    if (process.platform !== 'win32') return row
    const dl = row.pathDriveless ?? pathDrivelessKey(norm)
    if (!dl) return row
    const L = letterForDriveless(dl)
    if (!L) return row
    return { ...row, path: windowsAbsoluteFromDriveLetter(L, dl) }
  })
}
