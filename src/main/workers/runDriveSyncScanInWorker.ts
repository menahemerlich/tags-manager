import { Worker } from 'node:worker_threads'
import { existsSync, statSync } from 'node:fs'
import type {
  DiffBuckets,
  ScanEntry,
  ScanMode,
  ScanProgress,
  ScanSide
} from '../../shared/driveSyncTypes'
import { computeDiff } from '../driveSync/diff'
import type {
  DriveSyncScanWorkerMessage,
  DriveSyncScanWorkerRequest
} from './driveSyncScanWorker'

export interface RunDriveSyncScanOptions {
  rootA: string
  rootB: string
  mode: ScanMode
  /** Streamed walk progress for either side. */
  onProgress?: (p: ScanProgress) => void
  /** Soft hard-cap on the whole operation. */
  hardTimeoutMs?: number
}

export interface RunDriveSyncScanResult {
  ok: true
  result: DiffBuckets
  counts: { scannedA: number; scannedB: number }
  elapsedMs: number
}

export interface RunDriveSyncScanError {
  ok: false
  error: string
  elapsedMs: number
}

let activeWorkerA: Worker | null = null
let activeWorkerB: Worker | null = null

/** Cancel any in-flight Drive Sync scan. Active runners reject with a "cancelled" result. */
export function cancelDriveSyncScan(): void {
  for (const w of [activeWorkerA, activeWorkerB]) {
    if (!w) continue
    try {
      w.postMessage({ type: 'cancel' })
    } catch {
      // ignore
    }
    try {
      void w.terminate()
    } catch {
      // ignore
    }
  }
  activeWorkerA = null
  activeWorkerB = null
}

interface SideOutcome {
  scanned: number
  error?: string
}

function spawnSide(
  side: ScanSide,
  root: string,
  onMessage: (msg: DriveSyncScanWorkerMessage) => void
): { worker: Worker; promise: Promise<SideOutcome> } {
  const worker = new Worker(new URL('./workers/driveSyncScanWorker.js', import.meta.url), {
    type: 'module'
  })
  // Track whether the worker emitted a terminal message ('done' or 'error') so we can distinguish
  // a clean exit (after our own terminate()) from a silent crash.
  let terminalReceived = false
  const promise = new Promise<SideOutcome>((resolve) => {
    worker.on('message', (msg: DriveSyncScanWorkerMessage) => {
      try {
        onMessage(msg)
      } catch (e) {
        // Don't let a malformed message kill the run; surface as error and resolve.
        terminalReceived = true
        resolve({
          scanned: 0,
          error: e instanceof Error ? e.message : String(e)
        })
        return
      }
      if (msg.type === 'done') {
        terminalReceived = true
        resolve({ scanned: msg.scanned })
      } else if (msg.type === 'error') {
        terminalReceived = true
        resolve({ scanned: 0, error: msg.error })
      }
    })
    worker.on('error', (err) => {
      terminalReceived = true
      resolve({ scanned: 0, error: err.message || String(err) })
    })
    worker.on('exit', () => {
      // Only treat exit as a failure if we never got 'done'/'error'. Otherwise it's our own
      // terminate() after a clean run.
      if (!terminalReceived) {
        resolve({ scanned: 0, error: 'worker exited unexpectedly' })
      }
    })
  })
  worker.postMessage({ side, root } satisfies DriveSyncScanWorkerRequest)
  return { worker, promise }
}

/** Quickly verify that a path is a directory before launching a worker. */
function preflightRoot(label: ScanSide, root: string): string | null {
  if (!root || !root.trim()) {
    return `${label === 'A' ? "תיקייה א'" : "תיקייה ב'"} חסרה`
  }
  try {
    const st = statSync(root)
    if (!st.isDirectory()) {
      return `${label === 'A' ? "תיקייה א'" : "תיקייה ב'"} אינה תיקייה: ${root}`
    }
  } catch {
    if (!existsSync(root)) {
      return `${label === 'A' ? "תיקייה א'" : "תיקייה ב'"} לא קיימת: ${root}`
    }
    return `אין גישה ל-${label === 'A' ? "תיקייה א'" : "תיקייה ב'"}: ${root}`
  }
  return null
}

/**
 * Run a parallel scan of `rootA` and `rootB` in two workers, then compute the diff.
 * Streams `onProgress` events live as entries are scanned.
 */
export async function runDriveSyncScanInWorker(
  opts: RunDriveSyncScanOptions
): Promise<RunDriveSyncScanResult | RunDriveSyncScanError> {
  cancelDriveSyncScan()

  const t0 = Date.now()
  const hardTimeoutMs = opts.hardTimeoutMs ?? 10 * 60 * 1000
  const entriesBySide: Record<ScanSide, ScanEntry[]> = { A: [], B: [] }

  // Fail fast with a meaningful error instead of returning empty results when a path is wrong —
  // this used to be reported as "no differences" because both empty ↔ empty diffs to nothing.
  const errA = preflightRoot('A', opts.rootA)
  if (errA) return { ok: false, error: errA, elapsedMs: Date.now() - t0 }
  const errB = preflightRoot('B', opts.rootB)
  if (errB) return { ok: false, error: errB, elapsedMs: Date.now() - t0 }

  const handleMessage = (msg: DriveSyncScanWorkerMessage): void => {
    if (msg.type === 'entries') {
      const bucket = entriesBySide[msg.side]
      if (!bucket) return
      // Use a loop instead of `push(...arr)` to avoid argument-count limits on huge batches.
      for (const e of msg.entries) bucket.push(e)
    } else if (msg.type === 'progress') {
      opts.onProgress?.({
        side: msg.side,
        scanned: msg.scanned,
        currentPath: msg.currentPath,
        phase: 'walk'
      })
    }
  }

  const a = spawnSide('A', opts.rootA, handleMessage)
  const b = spawnSide('B', opts.rootB, handleMessage)
  activeWorkerA = a.worker
  activeWorkerB = b.worker

  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<{ timeout: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timeout: true }), hardTimeoutMs)
  })

  let timedOut = false
  const both = Promise.all([a.promise, b.promise]).then((vals) => ({ vals }))
  const raced = await Promise.race([both, timeout])
  if (timer) clearTimeout(timer)

  if ('timeout' in raced) {
    timedOut = true
    cancelDriveSyncScan()
    return {
      ok: false,
      error: `drive-sync scan timeout after ${hardTimeoutMs}ms`,
      elapsedMs: Date.now() - t0
    }
  }

  const [resA, resB] = raced.vals

  try {
    void a.worker.terminate()
  } catch {
    // ignore
  }
  try {
    void b.worker.terminate()
  } catch {
    // ignore
  }
  if (activeWorkerA === a.worker) activeWorkerA = null
  if (activeWorkerB === b.worker) activeWorkerB = null

  if (resA.error || resB.error) {
    const error = resA.error ?? resB.error ?? 'unknown error'
    if (/cancelled/i.test(error)) {
      return { ok: false, error: 'cancelled', elapsedMs: Date.now() - t0 }
    }
    return { ok: false, error, elapsedMs: Date.now() - t0 }
  }

  // Compute the diff. In accurate mode this also streams hash progress as a 'hash' phase.
  const diff = await computeDiff(entriesBySide.A, entriesBySide.B, {
    mode: opts.mode,
    rootA: opts.rootA,
    rootB: opts.rootB,
    onHashProgress: (done, total) => {
      opts.onProgress?.({
        side: 'A',
        scanned: done,
        currentPath: '',
        phase: 'hash',
        total
      })
    }
  })

  if (timedOut) {
    return { ok: false, error: 'cancelled', elapsedMs: Date.now() - t0 }
  }

  return {
    ok: true,
    result: diff,
    counts: { scannedA: resA.scanned, scannedB: resB.scanned },
    elapsedMs: Date.now() - t0
  }
}
