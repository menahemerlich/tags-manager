import { Worker } from 'node:worker_threads'
import type { PathKind } from '../../shared/types'
import type {
  SmartSuggestWorkerRequest,
  SmartSuggestWorkerResponse,
  SmartSuggestWorkerErrorResponse
} from './smartSuggestWorker'

export type SmartSuggestResult = SmartSuggestWorkerResponse | SmartSuggestWorkerErrorResponse

let activeWorker: Worker | null = null

/** Cancel any in-flight Smart Suggest run. The pending caller will receive a "cancelled" result. */
export function cancelSmartSuggest(): void {
  const w = activeWorker
  if (!w) return
  activeWorker = null
  try {
    void w.terminate()
  } catch {
    // ignore
  }
}

export async function runSmartSuggestInWorker(payload: {
  selectionItems: { path: string; kind: PathKind }[]
  hardTimeoutMs?: number
}): Promise<SmartSuggestResult> {
  // Auto-cancel a previous in-flight run.
  cancelSmartSuggest()

  return await new Promise((resolve) => {
    const t0 = Date.now()
    const worker = new Worker(new URL('./workers/smartSuggestWorker.js', import.meta.url), {
      type: 'module'
    })
    activeWorker = worker

    let settled = false
    const settle = (msg: SmartSuggestResult): void => {
      if (settled) return
      settled = true
      if (activeWorker === worker) activeWorker = null
      try {
        worker.removeAllListeners()
      } catch {
        // ignore
      }
      try {
        void worker.terminate()
      } catch {
        // ignore
      }
      clearTimeout(hardTimer)
      resolve(msg)
    }

    const hardTimeoutMs = payload.hardTimeoutMs ?? 30_000
    const hardTimer = setTimeout(() => {
      settle({ ok: false, error: `smart-suggest timeout after ${hardTimeoutMs}ms`, elapsedMs: Date.now() - t0 })
    }, hardTimeoutMs)

    worker.once('message', (msg: SmartSuggestResult) => settle(msg))
    worker.once('error', (err) => {
      settle({ ok: false, error: err.message || String(err), elapsedMs: Date.now() - t0 })
    })
    worker.once('exit', (code) => {
      // If the worker exited before posting a message, treat as cancelled.
      if (!settled) settle({ ok: false, error: `cancelled (exit ${code})`, elapsedMs: Date.now() - t0 })
    })

    worker.postMessage({ selectionItems: payload.selectionItems } satisfies SmartSuggestWorkerRequest)
  })
}
