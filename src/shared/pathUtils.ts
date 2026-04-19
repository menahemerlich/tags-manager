import path from 'node:path'

/**
 * מנקה תווים בלתי נראים ששוברים ניתוב (במיוחד עם UI בעברית/RTL):
 * - סימוני כיוון (RLM/LRM/embeddings) שגורמים ל־`path.resolve` לראות נתיב יחסי ב־Windows
 * - רווח רוחב אפס U+200B שנכנס מעתיקה מדפדפן/צ'אט
 * - BOM ושורות חדשות
 * תמיד להריץ לפני `normalizePath` על כל נתיב מ־UI, IPC או SQLite.
 */
export function sanitizePathInput(p: string): string {
  if (typeof p !== 'string') return ''
  return p
    .replace(/\uFEFF/g, '')
    .replace(/\u200B/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '')
    .replace(/[\r\n]/g, '')
    .normalize('NFC')
    .trim()
}

/**
 * Windows: paths like `E:folder\file.jpg` (no `\` after the colon) are drive-relative, and
 * `path.resolve` combines them with the process cwd on that drive — often wrong for indexed paths.
 * Treat them as rooted on the drive: `E:\folder\file.jpg`.
 */
function fixWindowsDriveLetterPath(input: string): string {
  if (process.platform !== 'win32') return input
  const n = path.normalize(input)
  const m = /^([A-Za-z]):([^\\/])/.exec(n)
  if (m) return path.normalize(`${m[1]}:\\${n.slice(2)}`)
  return n
}

/**
 * נתיב מוחלט יציב למפתחות DB והשוואות.
 * תמיד עובר דרך `sanitizePathInput` (מונע ערבוב RTL/עברית ששובר את סדר התווים הלוגי לפני resolve).
 * ב־Windows מאחד `/` ל־`\\` אחרי normalize כדי שהשוואות מחרוזות יהיו עקביות.
 */
export function normalizePath(p: string): string {
  const cleaned = sanitizePathInput(p)
  if (!cleaned) return '.'
  const prepared = fixWindowsDriveLetterPath(cleaned)
  const resolved = path.resolve(prepared)
  let out = path.normalize(resolved)
  if (process.platform === 'win32') {
    out = out.replace(/\//g, '\\')
  }
  return out
}

/**
 * Windows: Electron `shell.openPath` / `shell.showItemInFolder` use Shell APIs that often reject
 * extended-length paths (`\\?\` / `\\?\UNC\`). That can surface as misleading errors like
 * "The system cannot find the drive specified" while the same path works in Explorer.
 * Keep `\\?\` for Node `fs`; pass this form to Shell only.
 */
export function toWindowsShellPath(fsPath: string): string {
  if (process.platform !== 'win32' || !fsPath) return fsPath
  if (fsPath.startsWith('\\\\?\\UNC\\')) {
    return '\\' + fsPath.slice('\\\\?\\UNC\\'.length)
  }
  if (fsPath.startsWith('\\\\?\\')) {
    return fsPath.slice(4)
  }
  return fsPath
}

/** All directory paths from file up to root (inclusive of each parent chain), normalized. */
export function ancestorDirsOfFile(filePath: string): string[] {
  const norm = normalizePath(filePath)
  const out: string[] = []
  let d = path.dirname(norm)
  const root = path.parse(norm).root
  while (true) {
    out.push(d)
    if (d === root) break
    const parent = path.dirname(d)
    if (parent === d) break
    d = parent
  }
  return out
}

/** Relative path from folder to target (target can be file or subfolder). Uses forward slashes for DB. */
export function relativePath(folderPath: string, targetPath: string): string {
  const folder = normalizePath(folderPath).replace(/[/\\]+$/, '')
  const target = normalizePath(targetPath)
  if (target === folder) return ''
  const sep = folder.includes('\\') ? '\\' : '/'
  const prefix = folder.endsWith(sep) ? folder : folder + sep
  if (!target.startsWith(prefix)) {
    throw new Error(`Target ${target} is not under folder ${folder}`)
  }
  return target.slice(prefix.length).replace(/\\/g, '/')
}

/** True if `folderPath` is a strict ancestor directory of `filePath` (or equals parent of file). */
export function isFolderAncestorOfFile(folderPath: string, filePath: string): boolean {
  const f = normalizePath(filePath)
  const folder = normalizePath(folderPath)
  const sep = path.sep
  if (f === folder) return false
  const prefix = folder.endsWith(sep) ? folder : folder + sep
  return f.startsWith(prefix)
}

/**
 * נתיב תחום חיפוש מנורמל: אחרי הסרת סלאשים מיותרים בסוף לא משאירים ב-Windows `D:` בלי `\` —
 * אחרת `pathDrivelessKey` נכשל ונופלים להשוואת prefix עם אות כונן במקום לפי זנב נתיב.
 */
export function normalizeSearchScopePath(scopePath: string): string {
  let base = normalizePath(scopePath).replace(/[/\\]+$/, '')
  if (process.platform === 'win32' && /^[A-Za-z]:$/.test(base)) {
    base += '\\'
  }
  return base
}

/**
 * Windows: stable key without drive letter for `X:\...` paths (`\lib\a.jpg`, lowercase).
 * UNC, extended paths that are not `\\?\X:\`, and non-Windows → `null` (use full absolute path as key).
 */
export function pathDrivelessKey(absolutePath: string): string | null {
  const norm = normalizePath(absolutePath)
  return pathDrivelessKeyNormalized(norm)
}

/** Like `pathDrivelessKey` but skips `normalizePath` when the caller already normalized. */
export function pathDrivelessKeyNormalized(normalizedAbsPath: string): string | null {
  if (process.platform !== 'win32') return null
  let p = normalizedAbsPath.replace(/\//g, '\\')
  if (p.startsWith('\\\\?\\UNC\\')) return null
  if (p.startsWith('\\\\?\\')) {
    const rest = p.slice(4)
    if (/^[A-Za-z]:\\/.test(rest)) p = rest
    else return null
  }
  if (p.startsWith('\\\\')) return null
  const m = /^([A-Za-z]):\\(.*)$/.exec(p)
  if (!m) return null
  const tail = m[2]
  const unified = tail.replace(/\//g, '\\').toLowerCase()
  return '\\' + unified
}

/**
 * Parent directory keys for a driveless key (Windows `\`-rooted), for tag inheritance.
 * Example: `\lib\a\b.txt` → `[\lib\a`, `\lib`, `\`] (same order style as walking up from parent).
 */
export function ancestorDrivelessDirs(drivelessKey: string | null): string[] {
  if (!drivelessKey) return []
  const out: string[] = []
  let d = path.win32.dirname(drivelessKey)
  while (true) {
    if (d === '\\') {
      out.push('\\')
      break
    }
    out.push(d)
    const parent = path.win32.dirname(d)
    if (parent === d) break
    d = parent
  }
  return out
}

/**
 * Windows: נתיב מוחלט מאות כונן + מפתח path_driveless (למשל `E` ו־`\a\b` → `E:\a\b`).
 * כש־`drivelessKey` הוא `\` בלבד — שורש הכונן (`E:\`).
 */
export function windowsAbsoluteFromDriveLetter(driveLetter: string, drivelessKey: string): string {
  const L = (/^([A-Za-z])/.exec(driveLetter)?.[1] ?? 'C').toUpperCase()
  if (drivelessKey === '\\') {
    return `${L}:\\`
  }
  const tail = drivelessKey.startsWith('\\') ? drivelessKey.slice(1) : drivelessKey
  return path.win32.normalize(`${L}:\\${tail}`)
}

/** Whether `itemDriveless` is the scope folder/file itself or nested under `scopeDriveless`. */
export function drivelessItemUnderScope(itemDriveless: string, scopeDriveless: string): boolean {
  if (scopeDriveless === '\\') {
    return itemDriveless !== '\\' && itemDriveless.startsWith('\\')
  }
  return itemDriveless === scopeDriveless || itemDriveless.startsWith(scopeDriveless + '\\')
}

/**
 * Rebuild absolute path under the chosen scope when DB `path` may still use an old drive letter.
 */
export function resolvePathForSearchScope(
  scopePath: string,
  storedAbsolutePath: string,
  itemDriveless: string | null
): string {
  const scopeNorm = normalizeSearchScopePath(scopePath)
  const sk = pathDrivelessKeyNormalized(scopeNorm)
  if (!itemDriveless || !sk) return storedAbsolutePath
  if (!drivelessItemUnderScope(itemDriveless, sk)) return storedAbsolutePath
  if (itemDriveless === sk) return scopeNorm
  const prefix = sk === '\\' ? '\\' : sk + '\\'
  const tail =
    sk === '\\'
      ? itemDriveless.replace(/^\\/, '')
      : itemDriveless.startsWith(prefix)
        ? itemDriveless.slice(prefix.length)
        : null
  if (tail === null) return storedAbsolutePath
  const parts = tail.split(/\\+/).filter(Boolean)
  if (parts.length === 0) return scopeNorm
  return normalizePath(path.join(scopeNorm, ...parts))
}
