import { Worker } from 'node:worker_threads'

import type { SearchResult } from '../../shared/types'

export async function searchByTagIdsInWorker(dbPath: string, requiredTagIds: number[]): Promise<SearchResult> {
  const worker = new Worker(new URL('./workers/searchWorker.js', import.meta.url), {
    workerData: { dbPath },
    type: 'module'
  })

  try {
    const result = await new Promise<SearchResult>((resolve, reject) => {
      const onMessage = (msg: unknown) => {
        const m = msg as { ok?: boolean; kind?: string; rows?: unknown[]; truncated?: boolean; error?: string }
        if (m.kind !== 'searchByTagIds') return
        if (m.ok) {
          resolve({ rows: (m.rows ?? []) as SearchResult['rows'], truncated: Boolean(m.truncated) })
        } else {
          reject(new Error(m.error || 'Search worker failed'))
        }
      }
      worker.on('message', onMessage)
      worker.on('error', (e) => reject(e))
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Search worker exited with code ${code}`))
      })

      worker.postMessage({ kind: 'searchByTagIds', requiredTagIds })
    })
    return result
  } finally {
    try {
      await worker.terminate()
    } catch {
      // ignore
    }
  }
}

