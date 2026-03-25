import type {
  ConflictListPayload,
  SyncCheckResult,
  SyncSummary
} from '../../../shared/types/sync.types'

export interface ISyncService {
  check(): Promise<SyncCheckResult>
  push(): Promise<SyncSummary>
  pull(): Promise<SyncSummary>
  readConflicts(): Promise<ConflictListPayload>
  resolveConflicts(
    resolutions: { id: string; choice: 'keep-mine' | 'use-cloud' }[]
  ): Promise<{ ok: boolean; error?: string }>
  resetSyncState(): Promise<{ ok: boolean; error?: string }>
  testConnection(): Promise<{ ok: boolean; error?: string }>
  readMigrationSql(): Promise<{ ok: boolean; sql?: string; error?: string }>
  getStatus(): Promise<{
    lastPushAt?: string
    lastPullAt?: string
    pendingConflicts: number
    deviceId?: string
  }>
}
