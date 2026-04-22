import { Worker } from 'node:worker_threads'

export type IdentityResult = {
  filePath: string
  fingerprint: string | null
  sizeBytes: number | null
  fileId: string | null
}

type Pending = {
  resolve: (r: IdentityResult) => void
  reject: (e: Error) => void
}

/**
 * Pool קטן ל-worker identity (fingerprint + FileID) כדי שלא ניצור worker לכל קובץ.
 * בשלב ראשון: worker אחד + תור.
 */
export class IdentityPool {
  private worker: Worker
  private pendingByPath = new Map<string, Pending>()

  constructor() {
    this.worker = new Worker(new URL('./identityWorker.ts', import.meta.url))
    this.worker.on('message', (msg: unknown) => {
      const m = msg as { kind?: string; ok?: boolean; filePath?: string; fingerprint?: string | null; sizeBytes?: number | null; fileId?: string | null; error?: string }
      if (m.kind !== 'computeIdentity' || typeof m.filePath !== 'string') return
      const pending = this.pendingByPath.get(m.filePath)
      if (!pending) return
      this.pendingByPath.delete(m.filePath)
      if (m.ok) {
        pending.resolve({
          filePath: m.filePath,
          fingerprint: m.fingerprint ?? null,
          sizeBytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : null,
          fileId: m.fileId ?? null
        })
      } else {
        pending.reject(new Error(m.error || 'identity worker failed'))
      }
    })
  }

  async close(): Promise<void> {
    try {
      await this.worker.terminate()
    } catch {
      // ignore
    }
  }

  compute(filePath: string): Promise<IdentityResult> {
    return new Promise<IdentityResult>((resolve, reject) => {
      this.pendingByPath.set(filePath, { resolve, reject })
      this.worker.postMessage({ kind: 'computeIdentity', filePath })
    })
  }
}

