/**
 * Shared types for the Drive Sync (folder comparison + selective copy) feature.
 * These types cross the IPC boundary between main and renderer.
 */

export type ScanMode = 'fast' | 'accurate'

/** A single filesystem entry collected during a scan, relative to its scan root. */
export interface ScanEntry {
  /** Path relative to the scan root, using forward slashes for stable cross-platform comparison. */
  relativePath: string
  /** Bytes for files; 0 for directories. */
  size: number
  /** Last-modified time in ms since epoch. */
  mtimeMs: number
  /** True for files, false for directories. */
  isFile: boolean
}

export type ScanSide = 'A' | 'B'

export type ScanPhase = 'walk' | 'hash'

export interface ScanProgress {
  side: ScanSide
  scanned: number
  /** Best-effort current path (may be empty during transitions). */
  currentPath: string
  phase: ScanPhase
  /** Optional total during 'hash' phase. */
  total?: number
}

export interface DiffEntry extends ScanEntry {}

export interface DifferingPair {
  relativePath: string
  a: ScanEntry
  b: ScanEntry
  /** Why we considered them different. */
  reason: 'size' | 'hash'
}

export interface DiffBuckets {
  onlyInA: DiffEntry[]
  onlyInB: DiffEntry[]
  differ: DifferingPair[]
}

export interface DriveSyncScanRequest {
  rootA: string
  rootB: string
  mode: ScanMode
}

export interface DriveSyncScanDone {
  ok: boolean
  /** Present when ok=false. */
  error?: string
  /** Present when ok=true. */
  result?: DiffBuckets
  /** Total wall-clock duration in ms. */
  elapsedMs: number
  /** Counts per side, for the summary UI. */
  counts?: { scannedA: number; scannedB: number }
}

/** What the user chose for an individual conflict. */
export type ConflictDecision = 'skip' | 'overwrite' | 'keep-both'

/** When prompted, user can apply a single decision to all subsequent conflicts. */
export interface ConflictResponse {
  decision: ConflictDecision
  applyToAll: boolean
}

/** A single copy job — copies one entry from `from` to `to`. */
export interface CopyJob {
  /** Side that is the source (where the file currently exists). */
  from: ScanSide
  /** Path relative to the source root. */
  relativePath: string
  /** True if entry is a directory. Directories are created with `recursive: true`. */
  isDirectory: boolean
}

export interface DriveSyncCopyRequest {
  rootA: string
  rootB: string
  jobs: CopyJob[]
  /** Optional default conflict decision applied silently when `applyToAll` is in effect. */
  defaultConflict?: ConflictDecision
}

export interface CopyConflictPrompt {
  /** Stable token used for the response IPC. */
  token: string
  job: CopyJob
  /** Absolute paths for display, not for trust. */
  sourcePath: string
  destinationPath: string
  /** Existing file metadata at the destination, when known. */
  existingSize?: number
  existingMtimeMs?: number
  /** Source file metadata, when known. */
  sourceSize?: number
  sourceMtimeMs?: number
}

export type CopyStage =
  | { type: 'start'; total: number }
  | { type: 'file'; index: number; total: number; relativePath: string }
  | { type: 'progress'; index: number; total: number; relativePath: string; bytesDone: number; bytesTotal: number }
  | { type: 'item-done'; index: number; total: number; relativePath: string; result: 'copied' | 'skipped' | 'renamed' | 'error'; error?: string }

export interface DriveSyncCopyDone {
  ok: boolean
  error?: string
  copied: number
  skipped: number
  renamed: number
  failed: number
  elapsedMs: number
}

/** IPC channel names — keep in sync with main, preload, and renderer. */
export const DRIVE_SYNC_CHANNELS = {
  scanStart: 'drive-sync:scan-start',
  scanCancel: 'drive-sync:scan-cancel',
  scanProgress: 'drive-sync:scan-progress',
  scanDone: 'drive-sync:scan-done',
  copyStart: 'drive-sync:copy-start',
  copyCancel: 'drive-sync:copy-cancel',
  copyProgress: 'drive-sync:copy-progress',
  copyDone: 'drive-sync:copy-done',
  conflictPrompt: 'drive-sync:conflict-prompt',
  conflictResponse: 'drive-sync:conflict-response'
} as const
