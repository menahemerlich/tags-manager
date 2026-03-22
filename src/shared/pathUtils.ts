import path from 'node:path'

/** Stable absolute path for DB keys and comparisons (Windows: preserve drive casing from input). */
export function normalizePath(p: string): string {
  const resolved = path.resolve(p)
  return path.normalize(resolved)
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
