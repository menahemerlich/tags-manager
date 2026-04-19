import { existsSync } from 'node:fs'
import type { SearchResultRow } from '../../shared/types'
import {
  firstWindowsDriveLetterFromPath,
  isWindowsRuntime,
  normalizePath,
  normalizeSearchScopePath,
  pathDrivelessKey,
  windowsAbsoluteFromDriveLetter
} from '../../shared/pathUtils'
import { tryResolveMediaFsPath } from './media/resolveMediaFsPath'

/** סדר אותיות: קודם תחום חיפוש (אם נבחר), אחר כך אות מהנתיב ב-DB, ואז שאר האל״ף־בי״ת — פחות עומס מסריקה עיוורת. */
function buildDriveLetterOrder(scopePath: string | null | undefined, rowPath: string): string[] {
  const order: string[] = []
  const add = (L: string | null | undefined) => {
    if (!L) return
    const u = L.toUpperCase()
    if (/^[A-Z]$/.test(u) && !order.includes(u)) order.push(u)
  }
  if (scopePath) {
    try {
      add(firstWindowsDriveLetterFromPath(normalizeSearchScopePath(scopePath)))
    } catch {
      /* ignore */
    }
  }
  add(firstWindowsDriveLetterFromPath(rowPath))
  for (let i = 0; i < 26; i++) add(String.fromCharCode(65 + i))
  return order
}

/**
 * מתאים נתיבי תוצאות חיפוש לכונן שבו הקבצים קיימים; ממוא לפי path_driveless; מחזיר אסינכרוני עם הפסקות ל-UI.
 */
export async function resolveSearchResultRowsDisplayPaths(
  rows: SearchResultRow[],
  opts?: { searchScope?: string | null }
): Promise<SearchResultRow[]> {
  const scopePath = opts?.searchScope ?? null
  const letterByDriveless = new Map<string, string | null>()

  const resolveLetterForDriveless = (dl: string, rowPath: string): string | null => {
    if (letterByDriveless.has(dl)) return letterByDriveless.get(dl) ?? null
    for (const L of buildDriveLetterOrder(scopePath, rowPath)) {
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

  const out: SearchResultRow[] = []
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && i % 100 === 0) {
      await new Promise<void>((r) => setImmediate(r))
    }
    const row = rows[i]
    const hit = tryResolveMediaFsPath(row.path)
    if (hit) {
      out.push({ ...row, path: hit })
      continue
    }
    const norm = normalizePath(row.path)
    try {
      if (existsSync(norm)) {
        out.push({ ...row, path: norm })
        continue
      }
    } catch {
      /* ignore */
    }
    if (!isWindowsRuntime()) {
      out.push(row)
      continue
    }
    const dl = row.pathDriveless ?? pathDrivelessKey(norm)
    if (!dl) {
      out.push(row)
      continue
    }
    const L = resolveLetterForDriveless(dl, row.path)
    if (!L) {
      out.push(row)
      continue
    }
    out.push({ ...row, path: windowsAbsoluteFromDriveLetter(L, dl) })
  }
  return out
}
