import { ipcMain } from 'electron'
import type { App } from 'electron'
import type { BrowserWindow } from 'electron'
import type { TagDatabase } from '../database'
import { SyncService } from '../services/sync/SyncService'
import {
  SYNC_CHECK,
  SYNC_PULL,
  SYNC_PUSH,
  SYNC_PROGRESS,
  SYNC_READ_MIGRATION_SQL,
  SYNC_READ_PENDING_CONFLICTS,
  SYNC_RESET_STATE,
  SYNC_RESOLVE_CONFLICTS,
  SYNC_STATUS,
  SYNC_TEST_CONNECTION
} from '../../shared/constants/ipc-channels'
import type { SyncProgressPayload } from '../../shared/types/sync.types'

export function registerSupabaseSyncIpc(
  app: App,
  getDb: () => TagDatabase,
  getWindow: () => BrowserWindow | null
): void {
  const svc = new SyncService(app, getDb)
  const emit = (payload: SyncProgressPayload) => {
    const win = getWindow()
    win?.webContents.send(SYNC_PROGRESS, payload)
  }

  ipcMain.handle(SYNC_PUSH, async () => svc.push((p) => emit(p)))
  ipcMain.handle(SYNC_PULL, async () => svc.pull((p) => emit(p)))
  ipcMain.handle(SYNC_CHECK, async () => svc.check())
  ipcMain.handle(SYNC_TEST_CONNECTION, async () => svc.testConnection())
  ipcMain.handle(SYNC_READ_PENDING_CONFLICTS, async () => svc.readConflicts())
  ipcMain.handle(SYNC_RESET_STATE, async () => svc.resetSyncState())
  ipcMain.handle(SYNC_STATUS, async () => svc.getStatus())
  ipcMain.handle(SYNC_READ_MIGRATION_SQL, async () => svc.readMigrationSql())
  ipcMain.handle(
    SYNC_RESOLVE_CONFLICTS,
    async (_e, payload: { resolutions: { id: string; choice: 'keep-mine' | 'use-cloud' }[] }) =>
      svc.resolveConflicts(payload.resolutions)
  )
}
