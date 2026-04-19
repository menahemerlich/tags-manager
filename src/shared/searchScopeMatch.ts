import {
  drivelessItemUnderScope,
  normalizePath,
  normalizeSearchScopePath,
  pathDrivelessKey
} from './pathUtils'

/**
 * האם נתיב תוצאה נמצא בתחום החיפוש — ב-Windows לפי מפתח ללא אות כונן כשאפשר, אחרת prefix על נתיב מלא.
 */
export function pathMatchesSearchScope(
  rowPath: string,
  scopePath: string | null,
  pathDriveless?: string | null
): boolean {
  if (!scopePath) return true
  const base = normalizeSearchScopePath(scopePath)
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
