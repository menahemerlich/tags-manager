/** High-level state of the in-app update flow (main process). */
export type UpdateStatus = 'idle' | 'checking' | 'awaiting-download-confirm' | 'downloading' | 'awaiting-restart'

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateInfo {
  version: string
  releaseDate?: string
}

/** Classified error for logging / messaging. */
export type UpdateErrorType =
  | 'network'
  | 'server'
  | 'download-interrupted'
  | 'corrupted'
  | 'unknown'

/** Main → renderer (Settings) for update UI. */
export type UpdateFeedMessage =
  | { type: 'manual-check-finished'; result: 'up-to-date' }
  | { type: 'manual-check-finished'; result: 'error'; message: string }
  | { type: 'manual-check-finished'; result: 'update-prompt-shown' }
  | { type: 'download-progress'; percent: number }
  | { type: 'download-active'; active: boolean }
