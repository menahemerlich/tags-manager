import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../shared/types'
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
  SYNC_TEST_CONNECTION,
  MEDIA_EXPLAIN_PATH,
  MEDIA_GET_MEDIA_URL,
  MEDIA_GET_THUMBNAIL,
  UPDATE_CHECK,
  DATA_RELOAD_USER_DATA,
  UPDATE_FEED,
  UPDATE_GET_STATUS,
  WATERMARK_IMAGE_EXPORT_BUSY,
  WATERMARK_VIDEO_EXPORT_PROGRESS
} from '../shared/constants/ipc-channels'
import type { ConflictListPayload, SyncCheckResult, SyncProgressPayload, SyncSummary } from '../shared/types/sync.types'
import type { MediaPathDiagnostics } from '../shared/api'
import type {
  PathKind,
  SearchResult,
  TagImportApplyPayload,
  TagImportPreview,
  TagRow,
  SearchResultRow,
  TagFolderRow,
  ImportProgress,
  TransferPackageProgress,
  FaceAddEmbeddingPayload,
  FaceDetection,
  FacePersonEmbeddings,
  FaceAnalyzeAndMatchResponse,
  FaceAnalyzeAndMatchErrorResponse,
  FaceEmbeddingMetaRow,
  FaceReplaceEmbeddingPayload,
  PackageAppForTransferOptions,
  PackageAppForTransferResult,
  ImportUserDataResult,
  VideoTrimSegmentPayload,
  VideoTrimSegmentResult,
  WatermarkBakeToolPayload,
  WatermarkExportPayload,
  WatermarkPreviewPayload,
  WatermarkExportResult,
  WatermarkVideoExportPayload
} from '../shared/types'
import type { UpdateFeedMessage } from '../shared/types/update.types'

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
  listTagFolders: () => ipcRenderer.invoke('tag-folders:list') as Promise<TagFolderRow[]>,
  createTagFolder: (name: string) =>
    ipcRenderer.invoke('tag-folders:create', name) as Promise<{ ok: true; id: number } | { ok: false; error: string }>,
  deleteTagFolder: (id: number) => ipcRenderer.invoke('tag-folders:delete', id) as Promise<{ ok: true }>,
  renameTagFolder: (id: number, name: string) =>
    ipcRenderer.invoke('tag-folders:rename', { id, name }) as Promise<{ ok: true } | { ok: false; error: string }>,
  setTagFolderForTag: (tagId: number, folderId: number | null) =>
    ipcRenderer.invoke('tag-folders:set-tag-folder', { tagId, folderId }) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  renameTag: (id: number, name: string) =>
    ipcRenderer.invoke('tags:rename', { id, name }) as Promise<{ ok: true } | { ok: false; error: string }>,
  deleteTag: (id: number) => ipcRenderer.invoke('tags:delete', id) as Promise<{ ok: true }>,
  search: (tagNames: string[]) =>
    ipcRenderer.invoke('search:query', tagNames) as Promise<SearchResult>,
  resolveSearchDisplayPaths: (rows: SearchResultRow[], searchScope?: string | null) =>
    ipcRenderer.invoke('paths:resolve-search-display', rows, searchScope ?? null) as Promise<SearchResultRow[]>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  setSettings: (s: AppSettings) => ipcRenderer.invoke('settings:set', s) as Promise<{ ok: true }>,
  packageAppForTransfer: (options: PackageAppForTransferOptions) =>
    ipcRenderer.invoke('app:package-for-transfer', options) as Promise<PackageAppForTransferResult>,
  getUpdateStatus: () =>
    ipcRenderer.invoke(UPDATE_GET_STATUS) as Promise<{ version: string; isPackaged: boolean }>,
  checkForUpdatesManual: () =>
    ipcRenderer.invoke(UPDATE_CHECK) as Promise<
      { ok: true } | { ok: false; reason: 'dev' | 'no-service' } | { ok: false; error: string }
    >,
  onUpdateFeed: (cb: (msg: UpdateFeedMessage) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: UpdateFeedMessage) => cb(msg)
    ipcRenderer.on(UPDATE_FEED, handler)
    return () => ipcRenderer.removeListener(UPDATE_FEED, handler)
  },
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
  getFacePeopleEmbeddings: () =>
    ipcRenderer.invoke('faces:get-people-embeddings') as Promise<FacePersonEmbeddings[]>,
  addFaceEmbedding: (payload: FaceAddEmbeddingPayload) =>
    ipcRenderer.invoke('faces:add-embedding', payload) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  analyzeFacesInImage: (imagePath: string) =>
    ipcRenderer.invoke('faces:analyze-image', imagePath) as Promise<
      { ok: true; faces: FaceDetection[] } | { ok: false; error: string }
    >,
  analyzeAndMatchFacesInImage: (imagePath: string) =>
    ipcRenderer.invoke('faces:analyze-and-match-image', imagePath) as Promise<
      FaceAnalyzeAndMatchResponse | FaceAnalyzeAndMatchErrorResponse
    >,
  listFaceEmbeddingsMeta: () =>
    ipcRenderer.invoke('faces:list-embeddings-meta') as Promise<FaceEmbeddingMetaRow[]>,
  replaceFaceEmbedding: (payload: FaceReplaceEmbeddingPayload) =>
    ipcRenderer.invoke('faces:replace-embedding', payload) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  openAppUserDataDir: () => ipcRenderer.invoke('app:open-user-data-dir') as Promise<string>,
  reloadUserData: () =>
    ipcRenderer.invoke(DATA_RELOAD_USER_DATA) as Promise<{ ok: true } | { ok: false; error: string }>,
  importUserDataFromBackup: () => ipcRenderer.invoke('app:import-user-data') as Promise<ImportUserDataResult>,
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
  onTransferPackageProgress: (cb: (p: TransferPackageProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: TransferPackageProgress) => cb(payload)
    ipcRenderer.on('transfer-package:progress', handler)
    return () => ipcRenderer.removeListener('transfer-package:progress', handler)
  },
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files') as Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolders: () => ipcRenderer.invoke('dialog:pick-folders') as Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder') as Promise<string | null>,
  repairMovedFilesInFolder: (folderPath: string) =>
    ipcRenderer.invoke('identity:repair-moved', folderPath) as Promise<
      { ok: true; scanned: number; relinked: number } | { ok: false; error: string }
    >,
  smartSuggest: (items: { path: string; kind: PathKind }[]) =>
    ipcRenderer.invoke('smart-suggest:start', { items }) as Promise<
      import('../shared/types').SmartSuggestResult
    >,
  pickImage: () => ipcRenderer.invoke('dialog:pick-image') as Promise<string | null>,
  pickWatermarkBase: () => ipcRenderer.invoke('dialog:pick-watermark-base') as Promise<string | null>,
  getImageDataUrl: (filePath: string) => ipcRenderer.invoke('files:image-data-url', filePath) as Promise<string | null>,
  renderWatermarkPreview: (payload: WatermarkPreviewPayload) =>
    ipcRenderer.invoke('images:render-watermark-preview', payload) as Promise<string | null>,
  bakeWatermarkTool: (payload: WatermarkBakeToolPayload) =>
    ipcRenderer.invoke('images:bake-watermark-tool', payload) as Promise<string | null>,
  exportWatermarkedImage: (payload: WatermarkExportPayload) =>
    ipcRenderer.invoke('images:export-watermarked', payload) as Promise<WatermarkExportResult>,
  exportWatermarkedVideo: (payload: WatermarkVideoExportPayload) =>
    ipcRenderer.invoke('videos:export-watermarked', payload) as Promise<WatermarkExportResult>,
  trimVideoSegment: (payload: VideoTrimSegmentPayload) =>
    ipcRenderer.invoke('videos:trim-segment', payload) as Promise<VideoTrimSegmentResult>,
  onWatermarkVideoExportProgress: (cb: (p: { percent: number; outputBaseName?: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { percent: number; outputBaseName?: string }) =>
      cb(payload)
    ipcRenderer.on(WATERMARK_VIDEO_EXPORT_PROGRESS, handler)
    return () => ipcRenderer.removeListener(WATERMARK_VIDEO_EXPORT_PROGRESS, handler)
  },
  onWatermarkImageExportBusy: (cb: (p: { outputBaseName: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { outputBaseName: string }) => cb(payload)
    // `once` avoids runaway work if a listener is ever leaked: each export gets at most one fire.
    ipcRenderer.once(WATERMARK_IMAGE_EXPORT_BUSY, handler)
    return () => ipcRenderer.removeListener(WATERMARK_IMAGE_EXPORT_BUSY, handler)
  },
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath) as Promise<void>,
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath) as Promise<string>,
  supabaseSyncCheck: () => ipcRenderer.invoke(SYNC_CHECK) as Promise<SyncCheckResult>,
  supabaseSyncPush: () => ipcRenderer.invoke(SYNC_PUSH) as Promise<SyncSummary>,
  supabaseSyncPull: () => ipcRenderer.invoke(SYNC_PULL) as Promise<SyncSummary>,
  supabaseSyncTestConnection: () =>
    ipcRenderer.invoke(SYNC_TEST_CONNECTION) as Promise<{ ok: boolean; error?: string }>,
  supabaseSyncReadConflicts: () =>
    ipcRenderer.invoke(SYNC_READ_PENDING_CONFLICTS) as Promise<ConflictListPayload>,
  supabaseSyncResolveConflicts: (resolutions: { id: string; choice: 'keep-mine' | 'use-cloud' }[]) =>
    ipcRenderer.invoke(SYNC_RESOLVE_CONFLICTS, { resolutions }) as Promise<{ ok: boolean; error?: string }>,
  supabaseSyncResetState: () =>
    ipcRenderer.invoke(SYNC_RESET_STATE) as Promise<{ ok: boolean; error?: string }>,
  supabaseSyncStatus: () =>
    ipcRenderer.invoke(SYNC_STATUS) as Promise<{
      lastPushAt?: string
      lastPullAt?: string
      pendingConflicts: number
      deviceId?: string
    }>,
  supabaseSyncReadMigrationSql: () =>
    ipcRenderer.invoke(SYNC_READ_MIGRATION_SQL) as Promise<{ ok: boolean; sql?: string; error?: string }>
  ,
  onSupabaseSyncProgress: (cb: (p: SyncProgressPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: SyncProgressPayload) => cb(payload)
    ipcRenderer.on(SYNC_PROGRESS, handler)
    return () => ipcRenderer.removeListener(SYNC_PROGRESS, handler)
  },
  getThumbnail: (filePath: string, opts?: { force?: boolean }) =>
    ipcRenderer.invoke(MEDIA_GET_THUMBNAIL, filePath, opts) as Promise<string>,
  getMediaUrl: (filePath: string) => ipcRenderer.invoke(MEDIA_GET_MEDIA_URL, filePath) as Promise<string>,
  explainMediaPath: (filePath: string) =>
    ipcRenderer.invoke(MEDIA_EXPLAIN_PATH, filePath) as Promise<MediaPathDiagnostics>
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
