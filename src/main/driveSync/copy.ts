import {
  existsSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  readdirSync,
  statSync
} from 'node:fs'
import { stat as statAsync } from 'node:fs/promises'
import path from 'node:path'
import type { ConflictDecision, CopyJob, ScanSide } from '../../shared/driveSyncTypes'
import { normalizePath } from '../../shared/pathUtils'

export interface CopyContext {
  rootA: string
  rootB: string
}

export interface ResolvedCopyPaths {
  sourceAbs: string
  destAbs: string
  destSide: ScanSide
}

/** Compute absolute source/destination paths for a copy job, mirroring the relative path. */
export function resolveCopyPaths(ctx: CopyContext, job: CopyJob): ResolvedCopyPaths {
  const sourceRoot = job.from === 'A' ? ctx.rootA : ctx.rootB
  const destRoot = job.from === 'A' ? ctx.rootB : ctx.rootA
  const destSide: ScanSide = job.from === 'A' ? 'B' : 'A'
  const segments = job.relativePath.split('/')
  const sourceAbs = normalizePath(path.join(sourceRoot, ...segments))
  const destAbs = normalizePath(path.join(destRoot, ...segments))
  return { sourceAbs, destAbs, destSide }
}

/** Append " (1)", " (2)" etc. before the extension to produce a non-conflicting destination. */
export function makeKeepBothPath(destAbs: string): string {
  const ext = path.extname(destAbs)
  const stem = destAbs.slice(0, destAbs.length - ext.length)
  let i = 1
  while (i < 10000) {
    const candidate = `${stem} (${i})${ext}`
    if (!existsSync(candidate)) return candidate
    i += 1
  }
  // Extremely unlikely fallback.
  return `${stem} (${Date.now()})${ext}`
}

export interface CopyOneOptions {
  signal?: AbortSignal
  /** Notified roughly 5 times/sec while large files are being streamed. */
  onProgress?: (bytesDone: number, bytesTotal: number) => void
}

export type CopyOneResult =
  | { result: 'copied'; finalDest: string }
  | { result: 'skipped' }
  | { result: 'renamed'; finalDest: string }

/** Translate a Node fs error code into a Hebrew, user-meaningful message. */
function describeFsError(err: unknown, role: 'source' | 'dest', absPath: string): string {
  const e = err as NodeJS.ErrnoException | undefined
  const code = e?.code
  const where = role === 'source' ? 'קובץ המקור' : 'יעד ההעתקה'
  switch (code) {
    case 'ENOENT':
      return `${where} לא נמצא: ${absPath}`
    case 'EACCES':
    case 'EPERM':
      return `אין הרשאת גישה ל${where}: ${absPath}`
    case 'EBUSY':
      return `${where} בשימוש על ידי תהליך אחר: ${absPath}`
    case 'ENOSPC':
      return `אין מספיק מקום בכונן היעד: ${absPath}`
    case 'EISDIR':
      return `${where} הוא תיקייה ולא קובץ: ${absPath}`
    case 'ENOTDIR':
      return `נתיב היעד אינו תקין: ${absPath}`
    default:
      if (e?.message) return `${e.message} (${absPath})`
      return `שגיאה בלתי ידועה (${absPath})`
  }
}

/**
 * Stream-copy a single file, ensuring the destination directory exists. Decision-aware:
 * - 'skip' returns immediately if the destination already exists.
 * - 'overwrite' replaces the existing file.
 * - 'keep-both' picks a non-conflicting `name (N).ext` next to the existing one.
 *
 * On failure throws an `Error` with a Hebrew message that the UI can show directly.
 */
export async function copyOne(
  sourceAbs: string,
  destAbs: string,
  decision: ConflictDecision,
  opts: CopyOneOptions = {}
): Promise<CopyOneResult> {
  // Verify source is a readable file up-front so we can produce a clear error instead of
  // an opaque stream error later.
  let total = 0
  let sourceStat: ReturnType<typeof statSync>
  try {
    sourceStat = statSync(sourceAbs)
  } catch (e) {
    throw new Error(describeFsError(e, 'source', sourceAbs))
  }
  if (sourceStat.isDirectory()) {
    throw new Error(describeFsError({ code: 'EISDIR' }, 'source', sourceAbs))
  }
  total = Number(sourceStat.size ?? 0)

  let finalDest = destAbs
  if (existsSync(destAbs)) {
    if (decision === 'skip') return { result: 'skipped' }
    if (decision === 'keep-both') finalDest = makeKeepBothPath(destAbs)
    // 'overwrite' just replaces.
  }

  try {
    mkdirSync(path.dirname(finalDest), { recursive: true })
  } catch (e) {
    throw new Error(describeFsError(e, 'dest', path.dirname(finalDest)))
  }

  await new Promise<void>((resolve, reject) => {
    let rs: ReturnType<typeof createReadStream>
    let ws: ReturnType<typeof createWriteStream>
    try {
      rs = createReadStream(sourceAbs)
    } catch (e) {
      reject(new Error(describeFsError(e, 'source', sourceAbs)))
      return
    }
    try {
      ws = createWriteStream(finalDest)
    } catch (e) {
      rs.destroy()
      reject(new Error(describeFsError(e, 'dest', finalDest)))
      return
    }
    let bytesDone = 0
    let lastEmit = 0
    const emit = (): void => {
      const now = Date.now()
      if (now - lastEmit < 200) return
      lastEmit = now
      opts.onProgress?.(bytesDone, total)
    }
    const onAbort = (): void => {
      rs.destroy()
      ws.destroy()
      reject(new Error('cancelled'))
    }
    if (opts.signal?.aborted) {
      onAbort()
      return
    }
    // Track the abort listener so we can remove it on completion. Without this, every copyOne
    // call leaks a listener on the shared signal — Node warns at 11 listeners and ultimately
    // memory grows for long copy queues.
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    const cleanupAbort = (): void => {
      opts.signal?.removeEventListener('abort', onAbort)
    }
    rs.on('data', (chunk) => {
      bytesDone += chunk.length
      emit()
    })
    rs.on('error', (err) => {
      cleanupAbort()
      reject(new Error(describeFsError(err, 'source', sourceAbs)))
    })
    ws.on('error', (err) => {
      cleanupAbort()
      reject(new Error(describeFsError(err, 'dest', finalDest)))
    })
    ws.on('finish', () => {
      cleanupAbort()
      opts.onProgress?.(total, total)
      resolve()
    })
    rs.pipe(ws)
  })

  return finalDest === destAbs
    ? { result: 'copied', finalDest }
    : { result: 'renamed', finalDest }
}

export interface DestExistsInfo {
  exists: boolean
  size?: number
  mtimeMs?: number
}

export async function describeDest(destAbs: string): Promise<DestExistsInfo> {
  try {
    const st = await statAsync(destAbs)
    return { exists: true, size: Number(st.size ?? 0), mtimeMs: st.mtimeMs ?? 0 }
  } catch {
    return { exists: false }
  }
}

export async function describeSource(sourceAbs: string): Promise<DestExistsInfo> {
  return describeDest(sourceAbs)
}

export interface CopyFolderResult {
  /** Files newly copied (already-existing skipped/renamed are still counted here for clarity). */
  copied: number
  skipped: number
  renamed: number
  failed: number
  /** Per-file errors, only populated for failures so the UI can show a meaningful list. */
  errors: { relativePath: string; error: string }[]
}

export interface CopyFolderOptions {
  signal?: AbortSignal
  /** Default conflict decision — applied silently to every conflict during recursive copy. */
  defaultConflict?: ConflictDecision
  /** Called once per file with the per-file relative path and result. */
  onItem?: (relativePath: string, result: 'copied' | 'skipped' | 'renamed' | 'error', error?: string) => void
  /** Called with bytes-done while a single file streams. */
  onProgress?: (relativePath: string, bytesDone: number, bytesTotal: number) => void
}

/**
 * Recursively copy a folder's contents from `sourceAbs` to `destAbs`. Mirrors the source's
 * directory structure, creating directories at the destination and stream-copying each file.
 *
 * If `defaultConflict` is provided it's applied silently per file; otherwise existing files are
 * skipped (the IPC layer is responsible for prompting the user beforehand if interactive choice
 * is desired).
 */
export async function copyFolder(
  sourceAbs: string,
  destAbs: string,
  opts: CopyFolderOptions = {}
): Promise<CopyFolderResult> {
  const result: CopyFolderResult = { copied: 0, skipped: 0, renamed: 0, failed: 0, errors: [] }

  // Make sure source exists and is a directory before recursing.
  let rootStat: ReturnType<typeof statSync>
  try {
    rootStat = statSync(sourceAbs)
  } catch (e) {
    const error = describeFsError(e, 'source', sourceAbs)
    result.failed = 1
    result.errors.push({ relativePath: '', error })
    opts.onItem?.('', 'error', error)
    return result
  }
  if (!rootStat.isDirectory()) {
    const error = `מקור אינו תיקייה: ${sourceAbs}`
    result.failed = 1
    result.errors.push({ relativePath: '', error })
    opts.onItem?.('', 'error', error)
    return result
  }

  // Iterative DFS to avoid blowing the JS stack on deep trees and to support cancellation.
  const stack: { srcDir: string; destDir: string; rel: string }[] = [
    { srcDir: sourceAbs, destDir: destAbs, rel: '' }
  ]
  try {
    mkdirSync(destAbs, { recursive: true })
  } catch (e) {
    const error = describeFsError(e, 'dest', destAbs)
    result.failed = 1
    result.errors.push({ relativePath: '', error })
    opts.onItem?.('', 'error', error)
    return result
  }

  while (stack.length > 0) {
    if (opts.signal?.aborted) break
    const node = stack.pop()!
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(node.srcDir, { withFileTypes: true })
    } catch (e) {
      // Unreadable subdir — record as a single error and skip.
      const error = describeFsError(e, 'source', node.srcDir)
      result.failed += 1
      result.errors.push({ relativePath: node.rel, error })
      opts.onItem?.(node.rel, 'error', error)
      continue
    }

    for (const ent of entries) {
      if (opts.signal?.aborted) break
      const childSrc = path.join(node.srcDir, ent.name)
      const childDest = path.join(node.destDir, ent.name)
      const childRel = node.rel ? `${node.rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) {
        try {
          mkdirSync(childDest, { recursive: true })
          stack.push({ srcDir: childSrc, destDir: childDest, rel: childRel })
        } catch (e) {
          const error = describeFsError(e, 'dest', childDest)
          result.failed += 1
          result.errors.push({ relativePath: childRel, error })
          opts.onItem?.(childRel, 'error', error)
        }
      } else if (ent.isFile()) {
        try {
          const r = await copyOne(childSrc, childDest, opts.defaultConflict ?? 'overwrite', {
            signal: opts.signal,
            onProgress: (bytesDone, bytesTotal) =>
              opts.onProgress?.(childRel, bytesDone, bytesTotal)
          })
          if (r.result === 'copied') result.copied += 1
          else if (r.result === 'skipped') result.skipped += 1
          else if (r.result === 'renamed') result.renamed += 1
          opts.onItem?.(childRel, r.result)
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          if (error === 'cancelled') return result
          result.failed += 1
          result.errors.push({ relativePath: childRel, error })
          opts.onItem?.(childRel, 'error', error)
        }
      }
      // Other entry types (symlinks, etc.) are silently skipped — same as scanner.
    }
  }

  return result
}
