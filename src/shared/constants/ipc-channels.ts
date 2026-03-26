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

/** Media preview (thumbnails, streaming URLs). */
export const MEDIA_GET_THUMBNAIL = 'media:get-thumbnail' as const
export const MEDIA_GET_MEDIA_URL = 'media:get-media-url' as const
export const MEDIA_EXPLAIN_PATH = 'media:explain-path' as const

/** Watermark video encode progress (main → renderer). */
export const WATERMARK_VIDEO_EXPORT_PROGRESS = 'videos:export-watermarked-progress' as const

/** Watermark image export started after save dialog (main → renderer). */
export const WATERMARK_IMAGE_EXPORT_BUSY = 'images:export-watermarked-busy' as const

/** In-app updates (electron-updater): invoke from renderer. */
export const UPDATE_CHECK = 'update:manual-check' as const
export const UPDATE_GET_VERSION = 'update:get-version' as const
export const UPDATE_GET_STATUS = 'update:get-status' as const

/** Main → renderer: progress, manual check results, download state. */
export const UPDATE_FEED = 'update:feed' as const

/** Reload tags-manager.sqlite from disk (after manual file copy to userData). */
export const DATA_RELOAD_USER_DATA = 'data:reload-user-data' as const
