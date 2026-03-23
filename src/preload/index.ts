import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../shared/types'
import type {
  PathKind,
  SearchResult,
  TagImportApplyPayload,
  TagImportPreview,
  TagRow,
  ImportProgress,
  UpdateCheckResult
} from '../shared/types'

const api = {
  addItems: (items: { path: string; kind: PathKind }[], tagNames: string[]) =>
    ipcRenderer.invoke('paths:add-items', { items, tagNames }) as Promise<{ ok: true } | { ok: false; error: string }>,
  cancelIndex: () => ipcRenderer.invoke('paths:cancel-index') as Promise<{ ok: true }>,
  listPaths: () =>
    ipcRenderer.invoke('paths:list') as Promise<{ path: string; kind: PathKind; tags: string[] }[]>,
  getTagsForPath: (path: string) => ipcRenderer.invoke('paths:get-tags', path) as Promise<string[]>,
  getEffectiveTagsForPath: (path: string) =>
    ipcRenderer.invoke('paths:get-effective-tags', path) as Promise<string[]>,
  addTagToPath: (path: string, tagName: string) =>
    ipcRenderer.invoke('paths:add-tag', { path, tagName }) as Promise<{ ok: true }>,
  removeTagFromPath: (path: string, tagName: string) =>
    ipcRenderer.invoke('paths:remove-tag', { path, tagName }) as Promise<{ ok: true } | { ok: false; error: string }>,
  setPathTags: (path: string, tagNames: string[]) =>
    ipcRenderer.invoke('paths:set-tags', { path, tagNames }) as Promise<{ ok: true }>,
  listTags: () => ipcRenderer.invoke('tags:list') as Promise<TagRow[]>,
  renameTag: (id: number, name: string) =>
    ipcRenderer.invoke('tags:rename', { id, name }) as Promise<{ ok: true } | { ok: false; error: string }>,
  deleteTag: (id: number) => ipcRenderer.invoke('tags:delete', id) as Promise<{ ok: true }>,
  search: (tagNames: string[]) =>
    ipcRenderer.invoke('search:query', tagNames) as Promise<SearchResult>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  setSettings: (s: AppSettings) => ipcRenderer.invoke('settings:set', s) as Promise<{ ok: true }>,
  checkUpdates: () => ipcRenderer.invoke('updates:check') as Promise<UpdateCheckResult>,
  exportTagsJson: (scopePath: string) =>
    ipcRenderer.invoke('tags:export-json', scopePath) as Promise<
      { ok: true; filePath: string; exportedCount: number } | { ok: false; cancelled?: true; error?: string }
    >,
  importTagsPreview: (scopePath: string) =>
    ipcRenderer.invoke('tags:import-preview', scopePath) as Promise<
      { ok: true; preview: TagImportPreview } | { ok: false; cancelled?: true; error?: string }
    >,
  importTagsApply: (payload: TagImportApplyPayload) =>
    ipcRenderer.invoke('tags:import-apply', payload) as Promise<
      { ok: true; appliedCount: number; skippedCount: number } | { ok: false; error: string }
    >,
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  onIndexProgress: (cb: (p: { done: number; total: number; currentPath: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { done: number; total: number; currentPath: string }) =>
      cb(payload)
    ipcRenderer.on('index:progress', handler)
    return () => ipcRenderer.removeListener('index:progress', handler)
  },
  onImportProgress: (cb: (p: ImportProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ImportProgress) => cb(payload)
    ipcRenderer.on('import:progress', handler)
    return () => ipcRenderer.removeListener('import:progress', handler)
  },
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files') as Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolders: () => ipcRenderer.invoke('dialog:pick-folders') as Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder') as Promise<string | null>,
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath) as Promise<void>,
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath) as Promise<string>
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
