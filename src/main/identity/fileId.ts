import { createRequire } from 'node:module'
import { join } from 'node:path'

export type NtfsFileId = {
  volumeSerialNumber: number
  fileIndexHigh: number
  fileIndexLow: number
}

export function encodeNtfsFileId(id: NtfsFileId): string {
  // Stable string key for DB index; keep it simple and sortable.
  return [
    id.volumeSerialNumber.toString(16).padStart(8, '0'),
    id.fileIndexHigh.toString(16).padStart(8, '0'),
    id.fileIndexLow.toString(16).padStart(8, '0')
  ].join('-')
}

type NativeModule = {
  getFileId: (path: string) => NtfsFileId | null
}

let native: NativeModule | null = null

function tryLoadNative(): NativeModule | null {
  if (native) return native
  try {
    const require = createRequire(import.meta.url)
    // Default node-gyp output location (relative to project root at runtime in dev).
    const candidate = join(process.cwd(), 'src', 'native', 'fileid', 'build', 'Release', 'tags_manager_fileid.node')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(candidate) as NativeModule
    native = mod
    return mod
  } catch {
    return null
  }
}

/**
 * Windows NTFS FileID (volume serial + file index).
 * מחזיר null אם המודול הנייטיב לא זמין/לא נבנה או אם הנתיב לא קיים/אין הרשאה.
 */
export function getNtfsFileId(absolutePath: string): NtfsFileId | null {
  const mod = tryLoadNative()
  if (!mod) return null
  try {
    return mod.getFileId(absolutePath)
  } catch {
    return null
  }
}

