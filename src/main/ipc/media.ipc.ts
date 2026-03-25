import { ipcMain } from 'electron'
import type { App } from 'electron'
import { MEDIA_EXPLAIN_PATH, MEDIA_GET_MEDIA_URL, MEDIA_GET_THUMBNAIL } from '../../shared/constants/ipc-channels'
import { ThumbnailService } from '../services/media/ThumbnailService'
import { explainMediaPathDiagnostics, resolveMediaFsPathAsync } from '../services/media/resolveMediaFsPath'

export function registerMediaIpc(app: App): void {
  const thumbs = new ThumbnailService(app)

  ipcMain.handle(MEDIA_GET_THUMBNAIL, async (_e, filePath: string, opts?: { force?: boolean }) => {
    const p = await resolveMediaFsPathAsync(filePath)
    const r = await thumbs.ensureThumbnail(p, opts?.force === true)
    return r.url
  })

  ipcMain.handle(MEDIA_GET_MEDIA_URL, async (_e, filePath: string) => {
    const p = await resolveMediaFsPathAsync(filePath)
    return `local-resource://file/${encodeURIComponent(p)}`
  })

  ipcMain.handle(MEDIA_EXPLAIN_PATH, async (_e, filePath: string) => explainMediaPathDiagnostics(filePath))
}

