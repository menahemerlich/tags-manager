import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  DRIVE_SYNC_CHANNELS,
  type ConflictDecision,
  type ConflictResponse,
  type CopyConflictPrompt,
  type CopyJob,
  type CopyStage,
  type DriveSyncCopyDone,
  type DriveSyncCopyRequest,
  type DriveSyncScanDone,
  type DriveSyncScanRequest,
  type ScanProgress
} from '../../shared/driveSyncTypes'
import { normalizePath } from '../../shared/pathUtils'
import {
  cancelDriveSyncScan,
  runDriveSyncScanInWorker
} from '../workers/runDriveSyncScanInWorker'
import { copyFolder, copyOne, describeDest, describeSource, resolveCopyPaths } from '../driveSync/copy'

let copyAbort: AbortController | null = null

/** Pending conflict prompts keyed by token. The renderer responds via the response IPC. */
const pendingConflicts = new Map<string, (resp: ConflictResponse) => void>()

interface CopyContext {
  rootA: string
  rootB: string
}

/**
 * Drop child jobs whose ancestor directory is also being copied. The scanner emits each folder
 * AND each file within it; selecting the folder typically also includes its descendants in the
 * UI list, but we only need a single recursive copy job per top-level directory to avoid
 * duplicate work and spurious conflict prompts on the just-copied children.
 */
function dedupeNestedJobs(jobs: CopyJob[]): CopyJob[] {
  // Index directory jobs by their `from` side so an "A→B" dir does not swallow a "B→A" file.
  const dirsBySide = new Map<string, string[]>()
  for (const j of jobs) {
    if (!j.isDirectory) continue
    const arr = dirsBySide.get(j.from) ?? []
    arr.push(j.relativePath)
    dirsBySide.set(j.from, arr)
  }
  // Sort longest-first so a `foo` job is checked after `foo/bar/baz` (we don't actually need to,
  // but it makes the predicate simpler when both `foo` and `foo/bar` are selected — keep both
  // dirs only if neither is a strict ancestor of the other).
  return jobs.filter((j) => {
    const sameSideDirs = dirsBySide.get(j.from) ?? []
    for (const dirRel of sameSideDirs) {
      if (dirRel === j.relativePath) continue
      // Ancestor check uses '/' since relativePath always uses forward slashes.
      const prefix = dirRel.endsWith('/') ? dirRel : dirRel + '/'
      if (j.relativePath.startsWith(prefix)) return false
    }
    return true
  })
}

/**
 * Process the copy queue, prompting the renderer for each conflict (unless `applyToAll` is set).
 * Streams per-file progress through the `copy-progress` IPC channel.
 */
async function runCopyQueue(
  win: BrowserWindow,
  ctx: CopyContext,
  jobs: CopyJob[],
  defaultConflict: ConflictDecision | undefined,
  signal: AbortSignal
): Promise<DriveSyncCopyDone> {
  const t0 = Date.now()
  let copied = 0
  let skipped = 0
  let renamed = 0
  let failed = 0

  const sendProgress = (stage: CopyStage): void => {
    win.webContents.send(DRIVE_SYNC_CHANNELS.copyProgress, stage)
  }

  // Drop redundant child jobs whose ancestor directory is already in the queue: when the user
  // selects a folder we want a single recursive copy, not one job per child. Without this, child
  // file jobs would fire conflict prompts for files that the recursive copy already wrote.
  const dedupedJobs = dedupeNestedJobs(jobs)

  sendProgress({ type: 'start', total: dedupedJobs.length })

  let stickyDecision: ConflictDecision | null = defaultConflict ?? null

  for (let i = 0; i < dedupedJobs.length; i += 1) {
    if (signal.aborted) break
    const job = dedupedJobs[i]
    const { sourceAbs, destAbs } = resolveCopyPaths(ctx, job)
    sendProgress({
      type: 'file',
      index: i,
      total: dedupedJobs.length,
      relativePath: job.relativePath
    })

    if (job.isDirectory) {
      // Recursive folder copy — mirrors the entire subtree from source to destination. We don't
      // prompt for conflicts inside a recursive copy; instead apply the sticky/default decision
      // (defaults to 'overwrite' when the user opted to copy the folder explicitly).
      const folderDecision: ConflictDecision = stickyDecision ?? 'overwrite'
      const r = await copyFolder(sourceAbs, destAbs, {
        signal,
        defaultConflict: folderDecision,
        onProgress: (rel, bytesDone, bytesTotal) => {
          sendProgress({
            type: 'progress',
            index: i,
            total: dedupedJobs.length,
            relativePath: `${job.relativePath}/${rel}`,
            bytesDone,
            bytesTotal
          })
        }
      })
      copied += r.copied
      skipped += r.skipped
      renamed += r.renamed
      failed += r.failed
      if (r.failed > 0) {
        const first = r.errors[0]
        sendProgress({
          type: 'item-done',
          index: i,
          total: dedupedJobs.length,
          relativePath: job.relativePath,
          result: 'error',
          error: `${r.failed} שגיאות בתיקייה — לדוגמה: ${first?.error ?? ''}`
        })
      } else {
        sendProgress({
          type: 'item-done',
          index: i,
          total: dedupedJobs.length,
          relativePath: job.relativePath,
          result: 'copied'
        })
      }
      continue
    }

    const dest = await describeDest(destAbs)
    let decision: ConflictDecision = 'overwrite'
    if (dest.exists) {
      if (stickyDecision) {
        decision = stickyDecision
      } else {
        const src = await describeSource(sourceAbs)
        const token = randomUUID()
        const prompt: CopyConflictPrompt = {
          token,
          job,
          sourcePath: sourceAbs,
          destinationPath: destAbs,
          existingSize: dest.size,
          existingMtimeMs: dest.mtimeMs,
          sourceSize: src.size,
          sourceMtimeMs: src.mtimeMs
        }
        win.webContents.send(DRIVE_SYNC_CHANNELS.conflictPrompt, prompt)
        const resp = await new Promise<ConflictResponse>((resolve) => {
          pendingConflicts.set(token, resolve)
        })
        decision = resp.decision
        if (resp.applyToAll) stickyDecision = resp.decision
      }
    }

    try {
      const r = await copyOne(sourceAbs, destAbs, decision, {
        signal,
        onProgress: (bytesDone, bytesTotal) => {
          sendProgress({
            type: 'progress',
            index: i,
            total: dedupedJobs.length,
            relativePath: job.relativePath,
            bytesDone,
            bytesTotal
          })
        }
      })
      if (r.result === 'skipped') skipped += 1
      else if (r.result === 'renamed') renamed += 1
      else copied += 1
      sendProgress({
        type: 'item-done',
        index: i,
        total: dedupedJobs.length,
        relativePath: job.relativePath,
        result: r.result
      })
    } catch (e) {
      failed += 1
      sendProgress({
        type: 'item-done',
        index: i,
        total: dedupedJobs.length,
        relativePath: job.relativePath,
        result: 'error',
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }

  return {
    ok: !signal.aborted,
    error: signal.aborted ? 'cancelled' : undefined,
    copied,
    skipped,
    renamed,
    failed,
    elapsedMs: Date.now() - t0
  }
}

export function registerDriveSyncIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    DRIVE_SYNC_CHANNELS.scanStart,
    async (_e, payload: DriveSyncScanRequest): Promise<DriveSyncScanDone> => {
      const win = getWindow()
      const t0 = Date.now()
      try {
        const rootA = normalizePath(payload?.rootA ?? '')
        const rootB = normalizePath(payload?.rootB ?? '')
        if (!rootA || rootA === '.' || !rootB || rootB === '.') {
          return { ok: false, error: 'יש לבחור שתי תיקיות', elapsedMs: 0 }
        }
        // Windows filesystems are case-insensitive — guard against picking the same folder
        // with different casing (which would scan the same files and return zero differences).
        const sameFolder =
          process.platform === 'win32'
            ? path.resolve(rootA).toLowerCase() === path.resolve(rootB).toLowerCase()
            : path.resolve(rootA) === path.resolve(rootB)
        if (sameFolder) {
          return { ok: false, error: 'אותה תיקייה בשני הצדדים', elapsedMs: 0 }
        }
        const res = await runDriveSyncScanInWorker({
          rootA,
          rootB,
          mode: payload?.mode === 'accurate' ? 'accurate' : 'fast',
          onProgress: (p: ScanProgress) => {
            win?.webContents.send(DRIVE_SYNC_CHANNELS.scanProgress, p)
          }
        })
        if (!res.ok) {
          return { ok: false, error: res.error, elapsedMs: res.elapsedMs }
        }
        return {
          ok: true,
          result: res.result,
          counts: res.counts,
          elapsedMs: res.elapsedMs
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        return { ok: false, error, elapsedMs: Date.now() - t0 }
      }
    }
  )

  ipcMain.handle(DRIVE_SYNC_CHANNELS.scanCancel, async () => {
    cancelDriveSyncScan()
    return { ok: true as const }
  })

  ipcMain.handle(
    DRIVE_SYNC_CHANNELS.copyStart,
    async (_e, payload: DriveSyncCopyRequest): Promise<DriveSyncCopyDone> => {
      const win = getWindow()
      if (!win) return { ok: false, error: 'no window', copied: 0, skipped: 0, renamed: 0, failed: 0, elapsedMs: 0 }
      copyAbort?.abort()
      copyAbort = new AbortController()
      const ctx: CopyContext = {
        rootA: normalizePath(payload.rootA),
        rootB: normalizePath(payload.rootB)
      }
      try {
        const result = await runCopyQueue(
          win,
          ctx,
          payload.jobs ?? [],
          payload.defaultConflict,
          copyAbort.signal
        )
        win.webContents.send(DRIVE_SYNC_CHANNELS.copyDone, result)
        return result
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        const failed: DriveSyncCopyDone = {
          ok: false,
          error,
          copied: 0,
          skipped: 0,
          renamed: 0,
          failed: 0,
          elapsedMs: 0
        }
        win.webContents.send(DRIVE_SYNC_CHANNELS.copyDone, failed)
        return failed
      } finally {
        copyAbort = null
      }
    }
  )

  ipcMain.handle(DRIVE_SYNC_CHANNELS.copyCancel, async () => {
    copyAbort?.abort()
    // Resolve any pending conflict prompt as 'skip' to unblock the queue.
    for (const [, resolver] of pendingConflicts) {
      try {
        resolver({ decision: 'skip', applyToAll: true })
      } catch {
        // ignore
      }
    }
    pendingConflicts.clear()
    return { ok: true as const }
  })

  ipcMain.handle(
    DRIVE_SYNC_CHANNELS.conflictResponse,
    async (_e, payload: { token: string; response: ConflictResponse }) => {
      const resolver = pendingConflicts.get(payload?.token)
      if (resolver) {
        pendingConflicts.delete(payload.token)
        resolver(payload.response)
      }
      return { ok: true as const }
    }
  )
}
