import { ipcMain, type App, type BrowserWindow } from 'electron'
import { UPDATE_CHECK, UPDATE_GET_STATUS, UPDATE_GET_VERSION } from '../../shared/constants/ipc-channels'
import { createUpdateService, getUpdateService } from '../services/update/UpdateService'

export function registerUpdateIpc(app: App, getWindow: () => BrowserWindow | null): void {
  createUpdateService(app, getWindow).init()

  ipcMain.handle(UPDATE_GET_VERSION, async () => app.getVersion())

  ipcMain.handle(UPDATE_GET_STATUS, async () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged
  }))

  ipcMain.handle(UPDATE_CHECK, async () => {
    try {
      if (!app.isPackaged) {
        return { ok: false as const, reason: 'dev' as const }
      }
      const svc = getUpdateService()
      if (!svc) return { ok: false as const, reason: 'no-service' as const }
      await svc.runManualCheck()
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })
}
