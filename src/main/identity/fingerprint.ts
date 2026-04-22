import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'

export type FastFingerprintResult = {
  fingerprint: string
  sizeBytes: number
  sampleBytes: number
}

const DEFAULT_SAMPLE_BYTES = 10 * 1024

async function readAt(fd: { read: (buf: Buffer, offset: number, length: number, position: number) => Promise<{ bytesRead: number }> }, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.allocUnsafe(Math.max(0, length))
  const { bytesRead } = await fd.read(buf, 0, buf.length, position)
  return bytesRead === buf.length ? buf : buf.subarray(0, bytesRead)
}

/**
 * Fingerprint מהיר לקבצים גדולים:
 * - לא קורא את כל הקובץ (מתאים ל-20GB+)
 * - stable: מבוסס על size + head + tail (ללא mtime)
 */
export async function computeFastFingerprint(
  filePath: string,
  opts?: { sampleBytes?: number }
): Promise<FastFingerprintResult> {
  const sampleBytes = Math.max(1024, Math.floor(opts?.sampleBytes ?? DEFAULT_SAMPLE_BYTES))

  const fh = await open(filePath, 'r')
  try {
    const st = await fh.stat()
    const sizeBytes = Number(st.size ?? 0)
    const headLen = Math.min(sampleBytes, sizeBytes)
    const tailLen = Math.min(sampleBytes, Math.max(0, sizeBytes - headLen))
    const tailPos = Math.max(0, sizeBytes - tailLen)

    const head = headLen > 0 ? await readAt(fh, 0, headLen) : Buffer.alloc(0)
    const tail = tailLen > 0 ? await readAt(fh, tailPos, tailLen) : Buffer.alloc(0)

    const h = createHash('sha256')
    // header: fixed schema + size for collision resistance
    h.update('fast-sample-v1\0')
    h.update(String(sizeBytes))
    h.update('\0')
    h.update(head)
    h.update('\0')
    h.update(tail)

    return { fingerprint: h.digest('hex'), sizeBytes, sampleBytes }
  } finally {
    await fh.close()
  }
}

