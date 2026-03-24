import type {
  AppSettings,
  ImportProgress,
  PathKind,
  TransferPackageProgress,
  SearchResult,
  TagImportApplyPayload,
  TagImportPreview,
  TagRow,
  TagFolderRow,
  UpdateCheckResult,
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
  WatermarkExportPayload,
  WatermarkPreviewPayload,
  WatermarkExportResult
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
  listTagFolders: () => Promise<TagFolderRow[]>
  createTagFolder: (name: string) => Promise<{ ok: true; id: number } | { ok: false; error: string }>
  deleteTagFolder: (id: number) => Promise<{ ok: true }>
  setTagFolderForTag: (tagId: number, folderId: number | null) => Promise<{ ok: true } | { ok: false; error: string }>
  renameTag: (id: number, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteTag: (id: number) => Promise<{ ok: true }>
  search: (tagNames: string[]) => Promise<SearchResult>
  getSettings: () => Promise<AppSettings>
  setSettings: (s: AppSettings) => Promise<{ ok: true }>
  packageAppForTransfer: (options: PackageAppForTransferOptions) => Promise<PackageAppForTransferResult>
  checkUpdates: () => Promise<UpdateCheckResult>
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
  importUserDataFromBackup: () => Promise<ImportUserDataResult>
  onIndexProgress: (
    cb: (p: { done: number; total: number; currentPath: string }) => void
  ) => () => void
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void
  onTransferPackageProgress: (cb: (p: TransferPackageProgress) => void) => () => void
  pickFiles: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolders: () => Promise<{ path: string; kind: PathKind }[] | null>,
  pickFolder: () => Promise<string | null>,
  pickImage: () => Promise<string | null>,
  getImageDataUrl: (filePath: string) => Promise<string | null>,
  renderWatermarkPreview: (payload: WatermarkPreviewPayload) => Promise<string | null>,
  exportWatermarkedImage: (payload: WatermarkExportPayload) => Promise<WatermarkExportResult>,
  showInFolder: (filePath: string) => Promise<void>
  openPath: (filePath: string) => Promise<string>
}
