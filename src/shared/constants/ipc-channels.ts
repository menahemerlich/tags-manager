/** Centralized IPC channel names for sync (main ↔ preload). */

export const SYNC_PUSH = 'sync:supabase:push' as const
export const SYNC_PULL = 'sync:supabase:pull' as const
export const SYNC_CHECK = 'sync:supabase:check' as const
export const SYNC_TEST_CONNECTION = 'sync:supabase:test-connection' as const
export const SYNC_RESOLVE_CONFLICTS = 'sync:supabase:resolve-conflicts' as const
export const SYNC_RESET_STATE = 'sync:supabase:reset-state' as const
export const SYNC_READ_PENDING_CONFLICTS = 'sync:supabase:read-pending-conflicts' as const
export const SYNC_READ_MIGRATION_SQL = 'sync:supabase:read-migration-sql' as const
export const SYNC_STATUS = 'sync:supabase:status' as const
export const SYNC_PROGRESS = 'sync:supabase:progress' as const
