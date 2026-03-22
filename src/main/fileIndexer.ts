import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizePath } from '../shared/pathUtils'
import type { IndexProgress } from '../shared/types'

export interface IndexOptions {
  folderPath: string
  signal?: AbortSignal
  onProgress?: (p: IndexProgress) => void
}

/** Count files without storing paths (memory-safe for huge directories). */
async function countFilesRecursive(root: string, signal?: AbortSignal): Promise<number> {
  let count = 0
  async function walk(dir: string): Promise<void> {
    if (signal?.aborted) {
      const e = new Error('Aborted')
      e.name = 'AbortError'
      throw e
    }
    let entries: Awaited<ReturnType<typeof fs.readdir>>[number][] = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (signal?.aborted) {
        const e = new Error('Aborted')
        e.name = 'AbortError'
        throw e
      }
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        count++
      }
    }
  }
  await walk(normalizePath(root))
  return count
}

/** Walk and invoke onFile for each file (streams, no full path list in memory). */
async function walkFilesRecursive(
  root: string,
  onFile: (fp: string) => void,
  signal?: AbortSignal
): Promise<void> {
  async function walk(dir: string): Promise<void> {
    if (signal?.aborted) {
      const e = new Error('Aborted')
      e.name = 'AbortError'
      throw e
    }
    let entries: Awaited<ReturnType<typeof fs.readdir>>[number][] = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (signal?.aborted) {
        const e = new Error('Aborted')
        e.name = 'AbortError'
        throw e
      }
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        onFile(normalizePath(full))
      }
    }
  }
  await walk(normalizePath(root))
}

/** Walk and invoke onFile for each file; reports progress. Memory-safe for huge folders. */
export async function indexFolderFiles(
  opts: IndexOptions,
  onFile: (filePath: string) => void
): Promise<void> {
  const root = normalizePath(opts.folderPath)
  opts.onProgress?.({ done: 0, total: 0, currentPath: 'סופר קבצים…' })
  const total = await countFilesRecursive(root, opts.signal)
  let done = 0
  await walkFilesRecursive(
    root,
    (fp) => {
      onFile(fp)
      done++
      opts.onProgress?.({ done, total, currentPath: fp })
    },
    opts.signal
  )
}
