/** Types for Supabase row-level sync (shared between main and renderer). */

export interface SyncCredentials {
  supabaseUrl: string
  supabaseAnonKey: string
}

export interface SyncTableResult {
  table: string
  pushed?: number
  pulled?: number
  inserted?: number
  updated?: number
  skipped?: number
  conflicts?: number
  error?: string
}

export interface SyncSummary {
  ok: boolean
  message?: string
  tables: SyncTableResult[]
  lastOperationAt?: string
}

export type SyncOperation = 'push' | 'pull' | 'check' | 'resolve'

export interface SyncProgressPayload {
  operation: SyncOperation
  stage: 'start' | 'table' | 'progress' | 'done' | 'error'
  /** Current table (when stage is table/progress). */
  table?: string
  /** Human readable message (optional). */
  message?: string
  /** Processed items in current table. */
  tableDone?: number
  /** Total items in current table. */
  tableTotal?: number
  /** Processed items across all tables. */
  overallDone?: number
  /** Total items across all tables. */
  overallTotal?: number
}

export interface SyncCheckResult {
  ok: boolean
  upToDate: boolean
  totalPending: number
  perTable: { table: string; count: number }[]
  error?: string
}

export type ConflictResolutionChoice = 'keep-mine' | 'use-cloud'

export interface ConflictRecord {
  id: string
  table: string
  recordKey: string
  localRow: Record<string, unknown>
  cloudRow: Record<string, unknown>
  localUpdatedAt: string
  cloudUpdatedAt: string
}

export interface ConflictListPayload {
  conflicts: ConflictRecord[]
}
