import type {
  AppSettings,
  ImportProgress,
  PathKind,
  TransferPackageProgress,
  SearchResult,
  SearchResultRow,
  SmartSuggestResult,
  TagImportApplyPayload,
  TagImportPreview,
  TagRow,
  TagFolderRow,
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
} from './types'
import type { ConflictListPayload, SyncCheckResult, SyncProgressPayload, SyncSummary } from './types/sync.types'
import type { UpdateFeedMessage } from './types/update.types'
import type {
  ConflictResponse,
  CopyConflictPrompt,
  CopyStage,
  DriveSyncCopyDone,
  DriveSyncCopyRequest,
  DriveSyncScanDone,
  DriveSyncScanRequest,
  ScanProgress
} from './driveSyncTypes'

/** Debug payload: how main process interprets a file path (IPC / fs). */
export interface MediaPathDiagnostics {
  receivedLength: number
  leadingCodePoints: { cp: number; char: string }[]
  sanitized: string
  normalizedLikeOpenButton: string
  resolvedExistingPath: string | null
}

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
  listTagFolders: () => Promise<TagFolderRow[]>
  createTagFolder: (name: string) => Promise<{ ok: true; id: number } | { ok: false; error: string }>
  deleteTagFolder: (id: number) => Promise<{ ok: true }>
  renameTagFolder: (id: number, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  setTagFolderForTag: (tagId: number, folderId: number | null) => Promise<{ ok: true } | { ok: false; error: string }>
  renameTag: (id: number, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteTag: (id: number) => Promise<{ ok: true }>
  search: (tagNames: string[]) => Promise<SearchResult>
  /** התאמת אות כונן לנתיבים קיימים בדיסק (תצוגת חיפוש / פתיחה). */
  resolveSearchDisplayPaths: (rows: SearchResultRow[], searchScope?: string | null) => Promise<SearchResultRow[]>
  getSettings: () => Promise<AppSettings>
  setSettings: (s: AppSettings) => Promise<{ ok: true }>
  packageAppForTransfer: (options: PackageAppForTransferOptions) => Promise<PackageAppForTransferResult>
  getUpdateStatus: () => Promise<{ version: string; isPackaged: boolean }>
  checkForUpdatesManual: () =>
    Promise<{ ok: true } | { ok: false; reason: 'dev' | 'no-service' } | { ok: false; error: string }>
  onUpdateFeed: (cb: (msg: UpdateFeedMessage) => void) => () => void
  exportTagsJson: (scopePath: string) => Promise<{ ok: true; filePath: string; exportedCount: number } | { ok: false; cancelled?: true; error?: string }>
  importTagsPreview: (scopePath: string) => Promise<{ ok: true; preview: TagImportPreview } | { ok: false; cancelled?: true; error?: string }>
  importTagsApply: (
    payload: TagImportApplyPayload
  ) => Promise<{ ok: true; appliedCount: number; skippedCount: number } | { ok: false; error: string }>
  getFacePeopleEmbeddings: () => Promise<FacePersonEmbeddings[]>
  addFaceEmbedding: (payload: FaceAddEmbeddingPayload) => Promise<{ ok: true } | { ok: false; error: string }>
  analyzeFacesInImage: (imagePath: string) => Promise<{ ok: true; faces: FaceDetection[] } | { ok: false; error: string }>
  analyzeAndMatchFacesInImage: (imagePath: string) => Promise<FaceAnalyzeAndMatchResponse | FaceAnalyzeAndMatchErrorResponse>
  listFaceEmbeddingsMeta: () => Promise<FaceEmbeddingMetaRow[]>
  replaceFaceEmbedding: (payload: FaceReplaceEmbeddingPayload) => Promise<{ ok: true } | { ok: false; error: string }>
  getAppVersion: () => Promise<string>
  openAppUserDataDir: () => Promise<string>
  /** Reload SQLite DB from disk (e.g. after copying tags-manager.sqlite to userData). */
  reloadUserData: () => Promise<{ ok: true } | { ok: false; error: string }>
  importUserDataFromBackup: () => Promise<ImportUserDataResult>
  onIndexProgress: (
    cb: (p: { done: number; total: number; currentPath: string }) => void
  ) => () => void
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  onTransferPackageProgress: (cb: (p: TransferPackageProgress) => void) => () => void
  pickFiles: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolders: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolder: () => Promise<string | null>,
  /** סריקת תיקייה ידנית כדי לנסות למצוא קבצים שהועברו (רילינק לפי fingerprint/fileId). */
  repairMovedFilesInFolder: (folderPath: string) => Promise<{ ok: true; scanned: number; relinked: number } | { ok: false; error: string }>
  smartSuggest: (items: { path: string; kind: PathKind }[]) => Promise<SmartSuggestResult>
  cancelSmartSuggest: () => Promise<{ ok: true }>
  pickImage: () => Promise<string | null>,
  pickWatermarkBase: () => Promise<string | null>,
  getImageDataUrl: (filePath: string) => Promise<string | null>,
  renderWatermarkPreview: (payload: WatermarkPreviewPayload) => Promise<string | null>,
  bakeWatermarkTool: (payload: WatermarkBakeToolPayload) => Promise<string | null>,
  exportWatermarkedImage: (payload: WatermarkExportPayload) => Promise<WatermarkExportResult>,
  exportWatermarkedVideo: (payload: WatermarkVideoExportPayload) => Promise<WatermarkExportResult>,
  trimVideoSegment: (payload: VideoTrimSegmentPayload) => Promise<VideoTrimSegmentResult>,
  onWatermarkVideoExportProgress: (cb: (p: { percent: number; outputBaseName?: string }) => void) => () => void,
  onWatermarkImageExportBusy: (cb: (p: { outputBaseName: string }) => void) => () => void,
  showInFolder: (filePath: string) => Promise<void>
  openPath: (filePath: string) => Promise<string>
  supabaseSyncCheck: () => Promise<SyncCheckResult>
  supabaseSyncPush: () => Promise<SyncSummary>
  supabaseSyncPull: () => Promise<SyncSummary>
  supabaseSyncTestConnection: () => Promise<{ ok: boolean; error?: string }>
  supabaseSyncReadConflicts: () => Promise<ConflictListPayload>
  supabaseSyncResolveConflicts: (
    resolutions: { id: string; choice: 'keep-mine' | 'use-cloud' }[]
  ) => Promise<{ ok: boolean; error?: string }>
  supabaseSyncResetState: () => Promise<{ ok: boolean; error?: string }>
  supabaseSyncStatus: () => Promise<{
    lastPushAt?: string
    lastPullAt?: string
    pendingConflicts: number
    deviceId?: string
  }>
  supabaseSyncReadMigrationSql: () => Promise<{ ok: boolean; sql?: string; error?: string }>
  onSupabaseSyncProgress: (cb: (p: SyncProgressPayload) => void) => () => void
  getThumbnail: (filePath: string, opts?: { force?: boolean }) => Promise<string>
  getMediaUrl: (filePath: string) => Promise<string>
  /** For debugging "file not found" vs working Open button — same normalization as media + open. */
  explainMediaPath: (filePath: string) => Promise<MediaPathDiagnostics>
  driveSyncStart: (req: DriveSyncScanRequest) => Promise<DriveSyncScanDone>
  driveSyncCancel: () => Promise<{ ok: true }>
  driveSyncCopy: (req: DriveSyncCopyRequest) => Promise<DriveSyncCopyDone>
  driveSyncCopyCancel: () => Promise<{ ok: true }>
  respondDriveSyncConflict: (token: string, response: ConflictResponse) => Promise<{ ok: true }>
  onDriveSyncScanProgress: (cb: (p: ScanProgress) => void) => () => void
  onDriveSyncCopyProgress: (cb: (p: CopyStage) => void) => () => void
  onDriveSyncCopyDone: (cb: (p: DriveSyncCopyDone) => void) => () => void
  onDriveSyncConflictPrompt: (cb: (p: CopyConflictPrompt) => void) => () => void
}
