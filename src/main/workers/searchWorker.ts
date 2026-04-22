import { parentPort, workerData } from 'node:worker_threads'
import { TagDatabase } from '../database'

type SearchWorkerRequest = {
  kind: 'searchByTagIds'
  requiredTagIds: number[]
}

type SearchWorkerResponse =
  | { ok: true; kind: 'searchByTagIds'; rows: unknown[]; truncated: boolean }
  | { ok: false; kind: 'searchByTagIds'; error: string }

const dbPath = String((workerData as { dbPath?: string } | undefined)?.dbPath ?? '')

async function main(): Promise<void> {
  if (!parentPort) return
  if (!dbPath) {
    const msg: SearchWorkerResponse = { ok: false, kind: 'searchByTagIds', error: 'Missing dbPath' }
    parentPort.postMessage(msg)
    return
  }

  const db = await TagDatabase.open(dbPath)
  try {
    parentPort.on('message', async (req: SearchWorkerRequest) => {
      if (req.kind !== 'searchByTagIds') return
      try {
        const res = await db.searchFilesByTagIds(req.requiredTagIds)
        const msg: SearchWorkerResponse = { ok: true, kind: 'searchByTagIds', rows: res.rows, truncated: res.truncated }
        parentPort?.postMessage(msg)
      } catch (e) {
        const msg: SearchWorkerResponse = {
          ok: false,
          kind: 'searchByTagIds',
          error: e instanceof Error ? e.message : String(e)
        }
        parentPort?.postMessage(msg)
      }
    })
  } finally {
    // Worker uses its own sql.js instance; close to release memory.
    db.close()
  }
}

void main()

