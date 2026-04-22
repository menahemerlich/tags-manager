import { parentPort } from 'node:worker_threads'
import { computeFastFingerprint } from '../identity/fingerprint'
import { encodeNtfsFileId, getNtfsFileId } from '../identity/fileId'

type Req = {
  kind: 'computeIdentity'
  filePath: string
}

type Res =
  | {
      ok: true
      kind: 'computeIdentity'
      filePath: string
      fingerprint: string | null
      sizeBytes: number | null
      fileId: string | null
    }
  | { ok: false; kind: 'computeIdentity'; filePath: string; error: string }

if (parentPort) {
  parentPort.on('message', async (req: Req) => {
    if (req.kind !== 'computeIdentity') return
    try {
      const fp = await computeFastFingerprint(req.filePath)
      const ntfs = process.platform === 'win32' ? getNtfsFileId(req.filePath) : null
      const fileId = ntfs ? encodeNtfsFileId(ntfs) : null
      const res: Res = {
        ok: true,
        kind: 'computeIdentity',
        filePath: req.filePath,
        fingerprint: fp.fingerprint,
        sizeBytes: fp.sizeBytes,
        fileId
      }
      parentPort?.postMessage(res)
    } catch (e) {
      const res: Res = {
        ok: false,
        kind: 'computeIdentity',
        filePath: req.filePath,
        error: e instanceof Error ? e.message : String(e)
      }
      parentPort?.postMessage(res)
    }
  })
}

