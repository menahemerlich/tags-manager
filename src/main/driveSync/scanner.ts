import { promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'
import type { ScanEntry } from '../../shared/driveSyncTypes'
import { normalizePath } from '../../shared/pathUtils'

/**
 * Convert a path that may use either separator into a stable forward-slash
 * relative key. Used for comparison across platforms and for UI display.
 */
function toRelativeKey(rootAbs: string, fullAbs: string): string {
  const rel = path.relative(rootAbs, fullAbs)
  return rel.split(path.sep).join('/')
}

export interface ScanCallbacks {
  /** Called for each entry (file or directory) found. Should not throw. */
  onEntry: (entry: ScanEntry) => void
  /**
   * Best-effort progress callback. Called sparingly (throttled by the worker that drives the
   * scan); receives `(scanned, currentPath)`.
   */
  onProgress?: (scanned: number, currentPath: string) => void
  /** Optional cancellation. */
  signal?: AbortSignal
}

const DEFAULT_PROGRESS_INTERVAL_MS = 100

/**
 * Recursively walk `root` and emit a `ScanEntry` for every file and directory found beneath it
 * (excluding the root itself). The walk is iterative (stack-based) to avoid blowing the JS stack
 * on deep trees, and uses `withFileTypes: true` to avoid extra `stat` calls.
 *
 * - Stable: relative paths use `/` regardless of OS so they compare across machines.
 * - Robust: unreadable directories are silently skipped (permission errors etc.).
 * - Cancellable: aborts mid-walk when `signal.aborted` flips.
 */
export async function scanFolder(rootInput: string, cb: ScanCallbacks): Promise<{ scanned: number }> {
  const root = normalizePath(rootInput)
  let scanned = 0
  let lastProgressAt = 0

  const stack: string[] = [root]
  while (stack.length > 0) {
    if (cb.signal?.aborted) break
    const dir = stack.pop()!
    let entries: Dirent[] = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    // Sort for stable ordering of entries within a directory — helps reproducibility for tests
    // and gives a more predictable progress UI.
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const ent of entries) {
      if (cb.signal?.aborted) break
      const full = path.join(dir, ent.name)
      const relativePath = toRelativeKey(root, full)
      if (ent.isDirectory()) {
        cb.onEntry({ relativePath, size: 0, mtimeMs: 0, isFile: false })
        stack.push(full)
      } else if (ent.isFile()) {
        let size = 0
        let mtimeMs = 0
        try {
          const st = await fs.stat(full)
          size = Number(st.size ?? 0)
          mtimeMs = st.mtimeMs ?? 0
        } catch {
          // ignore unreadable files
        }
        cb.onEntry({ relativePath, size, mtimeMs, isFile: true })
      }
      scanned += 1
      const now = Date.now()
      if (cb.onProgress && now - lastProgressAt >= DEFAULT_PROGRESS_INTERVAL_MS) {
        lastProgressAt = now
        cb.onProgress(scanned, full)
      }
    }
  }

  cb.onProgress?.(scanned, '')
  return { scanned }
}
