import { Worker } from 'node:worker_threads'
import type { PathKind } from '../../shared/types'
import type {
  SmartSuggestWorkerRequest,
  SmartSuggestWorkerResponse,
  SmartSuggestWorkerErrorResponse
} from './smartSuggestWorker'

export type SmartSuggestResult = SmartSuggestWorkerResponse | SmartSuggestWorkerErrorResponse

export async function runSmartSuggestInWorker(payload: {
  selectionItems: { path: string; kind: PathKind }[]
}): Promise<SmartSuggestResult> {
  return await new Promise((resolve) => {
    const worker = new Worker(new URL('./workers/smartSuggestWorker.js', import.meta.url), { type: 'module' })
    const cleanup = () => {
      try {
        worker.removeAllListeners()
      } catch {}
      try {
        void worker.terminate()
      } catch {}
    }
    worker.once('message', (msg: SmartSuggestResult) => {
      cleanup()
      resolve(msg)
    })
    worker.once('error', (err) => {
      cleanup()
      resolve({ ok: false, error: err.message || String(err), elapsedMs: 0 })
    })
    worker.postMessage({ selectionItems: payload.selectionItems } satisfies SmartSuggestWorkerRequest)
  })
}

