import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import type { App } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { TagDatabase } from './database'
import { indexFolderFiles } from './fileIndexer'
import { loadSettings, saveSettings } from './settingsStore'
import type { AppSettings, TagExportJson, TagImportApplyPayload } from '../shared/types'
import { checkGithubRelease } from './updates'
import { normalizePath } from '../shared/pathUtils'
import { normalizeTagName } from '../shared/tagNormalize'
import type { PathKind } from '../shared/types'

let indexAbort: AbortController | null = null

function parseImportJson(raw: string): TagExportJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('קובץ JSON לא תקין')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('מבנה JSON לא תקין')
  const obj = parsed as Partial<TagExportJson>
  if (obj.format !== 'tags-manager-export-v1') throw new Error('פורמט קובץ לא נתמך')
  if (!Array.isArray(obj.entries)) throw new Error('רשומות ייבוא חסרות או לא תקינות')
  for (const entry of obj.entries) {
    if (!entry || typeof entry !== 'object') throw new Error('רשומת ייבוא לא תקינה')
    const e = entry as { path?: unknown; kind?: unknown; directTags?: unknown; excludedInheritedTags?: unknown }
    if (typeof e.path !== 'string' || !e.path.trim()) throw new Error('רשומת ייבוא כוללת נתיב לא תקין')
    if (e.kind !== 'file' && e.kind !== 'folder') throw new Error('סוג רשומה לא תקין')
    if (!Array.isArray(e.directTags) || !Array.isArray(e.excludedInheritedTags)) {
      throw new Error('רשומת ייבוא כוללת שדות תגיות לא תקינים')
    }
  }
  return obj as TagExportJson
}

export function registerIpcHandlers(
  app: App,
  getDb: () => TagDatabase,
  getWindow: () => BrowserWindow | null
): void {
  const sendProgress = (wc: WebContents | undefined, payload: { done: number; total: number; currentPath: string }) => {
    wc?.send('index:progress', payload)
  }

  ipcMain.handle(
    'paths:add-items',
    async (
      _evt,
      payload: { items: { path: string; kind: PathKind }[]; tagNames: string[] }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const db = getDb()
      const win = getWindow()
      indexAbort?.abort()
      indexAbort = new AbortController()
      const signal = indexAbort.signal

      try {
        for (const item of payload.items) {
          const p = normalizePath(item.path)
          if (item.kind === 'file') {
            db.setPathTags(p, payload.tagNames)
          } else {
            db.beginBulkMode()
            try {
              db.upsertPath(p, 'folder')
              db.setPathTags(p, payload.tagNames)
              await indexFolderFiles(
                { folderPath: p, signal, onProgress: (prog) => sendProgress(win?.webContents, prog) },
                (filePath) => {
                  db.upsertPath(filePath, 'file')
                }
              )
            } finally {
              db.endBulkMode()
            }
          }
        }
        return { ok: true as const }
      } catch (e) {
        const err = e as Error
        if (err.name === 'AbortError') return { ok: false, error: 'האינדוקס בוטל' }
        return { ok: false, error: err.message || String(e) }
      }
    }
  )

  ipcMain.handle('paths:cancel-index', async () => {
    indexAbort?.abort()
    return { ok: true as const }
  })

  ipcMain.handle('paths:list', async () => {
    return getDb().listUserVisiblePathsWithDirectTags()
  })

  ipcMain.handle('paths:get-tags', async (_e, path: string) => {
    return getDb().getDirectTagNamesForPath(normalizePath(path))
  })

  ipcMain.handle('paths:get-effective-tags', async (_e, path: string) => {
    return getDb().getEffectiveTagNamesForPath(normalizePath(path))
  })

  ipcMain.handle('paths:add-tag', async (_e, payload: { path: string; tagName: string }) => {
    const db = getDb()
    const p = normalizePath(payload.path)
    const kind = db.getPathKind(p) ?? 'file'
    const pathId = db.upsertPath(p, kind)
    const t = db.getOrCreateTag(payload.tagName)
    db.addTagToPath(pathId, t.id)
    return { ok: true as const }
  })

  ipcMain.handle('paths:remove-tag', async (_e, payload: { path: string; tagName: string }) => {
    const db = getDb()
    const p = normalizePath(payload.path)
    const kind = db.getPathKind(p) ?? 'file'
    const pathId = db.upsertPath(p, kind)
    const tagId = db.getTagIdByName(payload.tagName)
    if (tagId === undefined) return { ok: false as const, error: 'התגית לא נמצאה' }
    const direct = db.getDirectTagNamesForPathId(pathId)
    const hasDirect = direct.some((n) => n.toLowerCase() === payload.tagName.toLowerCase())
    if (hasDirect) {
      db.removeTagFromPath(pathId, tagId)
    } else {
      db.addExclusionToPath(pathId, tagId)
    }
    return { ok: true as const }
  })

  ipcMain.handle('tags:list', async () => {
    return getDb().listTags()
  })

  ipcMain.handle('tags:rename', async (_e, payload: { id: number; name: string }) => {
    try {
      getDb().renameTag(payload.id, payload.name)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:delete', async (_e, id: number) => {
    getDb().deleteTag(id)
    return { ok: true as const }
  })

  ipcMain.handle('tags:export-json', async (_e, scopePath: string) => {
    try {
      const normalizedScope = normalizePath(scopePath)
      const exportData = getDb().exportTagJsonByScope(normalizedScope)
      const win = getWindow()
      const suggestedBase = normalizedScope.replace(/[:\\\/]+/g, '_')
      const saveRes = await dialog.showSaveDialog(win ?? undefined, {
        title: 'ייצוא תגיות',
        defaultPath: `tags-export-${suggestedBase}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: false as const, cancelled: true as const }
      writeFileSync(saveRes.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return { ok: true as const, filePath: saveRes.filePath, exportedCount: exportData.entries.length }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:import-preview', async (_e, scopePath: string) => {
    const win = getWindow()
    const pickRes = await dialog.showOpenDialog(win ?? undefined, {
      title: 'ייבוא תגיות',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (pickRes.canceled || pickRes.filePaths.length === 0) return { ok: false as const, cancelled: true as const }
    try {
      const sourceFilePath = pickRes.filePaths[0] as string
      const raw = readFileSync(sourceFilePath, 'utf-8')
      const data = parseImportJson(raw)
      const preview = getDb().previewImportByScope(data, normalizePath(scopePath))
      return { ok: true as const, preview: { ...preview, sourceFilePath } }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:import-apply', async (_e, payload: TagImportApplyPayload) => {
    try {
      const db = getDb()
      const win = getWindow()
      const wc = win?.webContents
      db.beginBulkMode()
      const raw = readFileSync(payload.sourceFilePath, 'utf-8')
      const data = parseImportJson(raw)
      const result = await db.applyImportByScope(data, payload, {
        onProgress: (p) => wc?.send('import:progress', p)
      })
      return { ok: true as const, ...result }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    } finally {
      try {
        getDb().endBulkMode()
      } catch {
        // ignore
      }
    }
  })

  ipcMain.handle('search:query', async (_e, tagNames: string[]) => {
    const db = getDb()
    const normalized = tagNames.map((n) => normalizeTagName(n)).filter(Boolean)
    if (normalized.length === 0) return { rows: [], truncated: false }
    const ids: number[] = []
    for (const name of normalized) {
      const id = db.getTagIdByName(name)
      if (id === undefined) return { rows: [], truncated: false }
      ids.push(id)
    }
    return db.searchFilesByTagIds(ids)
  })

  ipcMain.handle('settings:get', async () => {
    return loadSettings(app)
  })

  ipcMain.handle('settings:set', async (_e, s: AppSettings) => {
    saveSettings(app, { githubRepo: s.githubRepo ?? '' })
    return { ok: true as const }
  })

  ipcMain.handle('updates:check', async () => {
    const settings = loadSettings(app)
    const parts = settings.githubRepo.split('/').map((x) => x.trim())
    if (parts.length !== 2) {
      return checkGithubRelease(app, '', '')
    }
    return checkGithubRelease(app, parts[0], parts[1])
  })

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion()
  })

  ipcMain.handle('shell:show-in-folder', async (_e, filePath: string) => {
    shell.showItemInFolder(normalizePath(filePath))
  })

  ipcMain.handle('shell:open-path', async (_e, filePath: string) => {
    await shell.openPath(normalizePath(filePath))
  })

  ipcMain.handle('dialog:pick-files', async () => {
    const win = getWindow()
    const r = await dialog.showOpenDialog(win ?? undefined, {
      title: 'בחר קבצים',
      properties: ['openFile', 'multiSelections']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths.map((fp) => ({ path: fp, kind: 'file' as PathKind }))
  })

  ipcMain.handle('dialog:pick-folders', async () => {
    const win = getWindow()
    const r = await dialog.showOpenDialog(win ?? undefined, {
      title: 'בחר תיקיות',
      properties: ['openDirectory', 'multiSelections']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths.map((fp) => ({ path: fp, kind: 'folder' as PathKind }))
  })

  ipcMain.handle('dialog:pick-folder', async () => {
    const win = getWindow()
    const r = await dialog.showOpenDialog(win ?? undefined, {
      title: 'בחר תיקייה לחיפוש',
      properties: ['openDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0] as string
  })
}
