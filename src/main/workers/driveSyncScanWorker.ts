import { parentPort } from 'node:worker_threads'
import { scanFolder } from '../driveSync/scanner'
import type { ScanEntry, ScanSide } from '../../shared/driveSyncTypes'

/** Request: scan a single root and stream results back to the parent. */
export interface DriveSyncScanWorkerRequest {
  side: ScanSide
  root: string
}

export type DriveSyncScanWorkerMessage =
  | { type: 'entries'; side: ScanSide; entries: ScanEntry[] }
  | { type: 'progress'; side: ScanSide; scanned: number; currentPath: string }
  | { type: 'done'; side: ScanSide; scanned: number }
  | { type: 'error'; side: ScanSide; error: string }

const ENTRY_BATCH_SIZE = 500
const PROGRESS_INTERVAL_MS = 120

let abortController: AbortController | null = null

parentPort?.on('message', async (msg: DriveSyncScanWorkerRequest | { type: 'cancel' }) => {
  if ((msg as { type?: string }).type === 'cancel') {
    abortController?.abort()
    return
  }
  const req = msg as DriveSyncScanWorkerRequest
  abortController = new AbortController()
  const { side, root } = req
  const port = parentPort
  if (!port) return

  let buffer: ScanEntry[] = []
  let lastProgressAt = 0

  const flush = (): void => {
    if (buffer.length === 0) return
    port.postMessage({ type: 'entries', side, entries: buffer } satisfies DriveSyncScanWorkerMessage)
    buffer = []
  }

  try {
    const { scanned } = await scanFolder(root, {
      signal: abortController.signal,
      onEntry: (entry) => {
        buffer.push(entry)
        if (buffer.length >= ENTRY_BATCH_SIZE) flush()
      },
      onProgress: (count, currentPath) => {
        const now = Date.now()
        if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return
        lastProgressAt = now
        port.postMessage({ type: 'progress', side, scanned: count, currentPath } satisfies DriveSyncScanWorkerMessage)
      }
    })
    flush()
    port.postMessage({ type: 'done', side, scanned } satisfies DriveSyncScanWorkerMessage)
  } catch (e) {
    flush()
    const error = e instanceof Error ? e.message : String(e)
    port.postMessage({ type: 'error', side, error } satisfies DriveSyncScanWorkerMessage)
  }
})
