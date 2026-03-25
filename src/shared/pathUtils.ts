import path from 'node:path'

/**
 * Removes invisible characters that break `path.resolve` / `fs` on Windows (e.g. RTL embedding
 * before `C:\` makes Node treat the path as relative and prepend cwd). Also BOM and line breaks.
 * Use before `normalizePath` for any path coming from UI, IPC, or SQLite.
 */
export function sanitizePathInput(p: string): string {
  if (typeof p !== 'string') return ''
  return p
    .replace(/\uFEFF/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
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

/** Stable absolute path for DB keys and comparisons (Windows: preserve drive casing from input). */
export function normalizePath(p: string): string {
  const trimmed = p.trim()
  if (!trimmed) return '.'
  const prepared = fixWindowsDriveLetterPath(trimmed)
  const resolved = path.resolve(prepared)
  return path.normalize(resolved)
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
