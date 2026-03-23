import type {
  AppSettings,
  ImportProgress,
  PathKind,
  SearchResult,
  TagImportApplyPayload,
  TagImportPreview,
  TagRow,
  UpdateCheckResult
} from './types'

/** Shape of `window.api` exposed from preload (for renderer typing). */
export interface ElectronApi {
  addItems: (
    items: { path: string; kind: PathKind }[],
    tagNames: string[]
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  cancelIndex: () => Promise<{ ok: true }>
  listPaths: () => Promise<{ path: string; kind: PathKind; tags: string[] }[]>
  getTagsForPath: (path: string) => Promise<string[]>
  getEffectiveTagsForPath: (path: string) => Promise<string[]>
  addTagToPath: (path: string, tagName: string) => Promise<{ ok: true }>
  removeTagFromPath: (path: string, tagName: string) => Promise<{ ok: true } | { ok: false; error: string }>,
  setPathTags: (path: string, tagNames: string[]) => Promise<{ ok: true }>,
  listTags: () => Promise<TagRow[]>
  renameTag: (id: number, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteTag: (id: number) => Promise<{ ok: true }>
  search: (tagNames: string[]) => Promise<SearchResult>
  getSettings: () => Promise<AppSettings>
  setSettings: (s: AppSettings) => Promise<{ ok: true }>
  checkUpdates: () => Promise<UpdateCheckResult>
  exportTagsJson: (scopePath: string) => Promise<{ ok: true; filePath: string; exportedCount: number } | { ok: false; cancelled?: true; error?: string }>
  importTagsPreview: (scopePath: string) => Promise<{ ok: true; preview: TagImportPreview } | { ok: false; cancelled?: true; error?: string }>
  importTagsApply: (
    payload: TagImportApplyPayload
  ) => Promise<{ ok: true; appliedCount: number; skippedCount: number } | { ok: false; error: string }>
  getAppVersion: () => Promise<string>
  onIndexProgress: (
    cb: (p: { done: number; total: number; currentPath: string }) => void
  ) => () => void
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  pickFiles: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolders: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolder: () => Promise<string | null>,
  showInFolder: (filePath: string) => Promise<void>
  openPath: (filePath: string) => Promise<string>
}
