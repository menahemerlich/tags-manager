export interface AppSettings {
  sync?: SyncSettings
}

export interface SyncSettings {
  /** Supabase project URL (no trailing slash). */
  supabaseUrl?: string
  /** Supabase anon (or service) key — never commit real keys. */
  supabaseAnonKey?: string
  lastSupabasePushAt?: string
  /**
   * Resume markers for push per-table.
   * If a push fails mid-run, we can avoid re-pushing tables that already completed.
   */
  lastSupabasePushAtByTable?: Record<string, string>
  lastSupabasePullAt?: string
  /** Stable id for this install (conflict metadata / logs). */
  syncDeviceId?: string
}

export interface TransferPackageProgress {
  stage:
    | 'idle'
    | 'select-destination'
    | 'validating'
    | 'persisting-data'
    | 'searching-installer'
    | 'building'
    | 'collecting-installer'
    | 'copying-data'
    | 'writing-instructions'
    | 'done'
    | 'error'
  message: string
  detail?: string
}

export interface PackageAppForTransferOptions {
  rebuildInstaller: boolean
}

export type PackageAppForTransferResult =
  | {
      ok: true
      bundleDir: string
      installerPath: string
      instructionsPath: string
      copiedUserDataFiles: string[]
      missingUserDataFiles: string[]
      installerStrategy: 'existing' | 'rebuilt'
    }
  | {
      ok: false
      cancelled?: true
      error?: string
    }

export type ImportUserDataResult =
  | {
      ok: true
      copiedFiles: string[]
      userDataDir: string
      restartScheduled: true
    }
  | {
      ok: false
      cancelled?: true
      error?: string
    }

export type PathKind = 'file' | 'folder'

export interface TagRow {
  id: number
  name: string
  created_at: string
}

export interface TagFolderRow {
  id: number
  name: string
  created_at: string
  tagIds: number[]
}

export interface PathRow {
  id: number
  path: string
  kind: PathKind
  updated_at: string
}

export interface SearchResultRow {
  path: string
  kind: 'file'
  tags: string[]
}

export interface SearchResult {
  rows: SearchResultRow[]
  truncated?: boolean
}

export interface IndexProgress {
  done: number
  total: number
  currentPath: string
}

export interface ImportProgress {
  done: number
  total: number
}

export interface TagExportEntry {
  path: string
  kind: PathKind
  directTags: string[]
  excludedInheritedTags: string[]
}

export interface TagExportJson {
  format: 'tags-manager-export-v1'
  exportedAt: string
  scopePath: string
  entries: TagExportEntry[]
}

export type ImportConflictChoice = 'skip' | 'replace' | 'merge'

export interface TagImportConflict {
  path: string
  kind: PathKind
  existingDirectTags: string[]
  importedDirectTags: string[]
  existingExcludedInheritedTags: string[]
  importedExcludedInheritedTags: string[]
}

export interface TagImportPreview {
  sourceFilePath: string
  scopePath: string
  totalEntries: number
  newEntries: number
  unchangedEntries: number
  conflictEntries: number
  conflicts: TagImportConflict[]
}

export interface TagImportApplyPayload {
  sourceFilePath: string
  scopePath: string
  defaultConflictChoice: ImportConflictChoice
  conflictChoicesByPath: Record<string, ImportConflictChoice>
}

export interface FacePersonEmbeddings {
  personId: number
  name: string
  embeddings: number[][]
}

export const FACE_EMBEDDING_MODEL_ID = 'arcface.buffalo_l.w600k_r50.v1'

export interface FaceAddEmbeddingPayload {
  name: string
  descriptor: number[]
  modelId: string
}

export interface FaceDetection {
  box: { x: number; y: number; width: number; height: number }
  descriptor: number[]
}

export interface FaceMatchCandidate {
  personId: number
  name: string
  distance: number
  sampleCount: number
  confidence: number
  threshold: number
  confidenceLabel: 'high' | 'probable' | 'uncertain'
}

export interface FaceDetectionWithCandidate extends FaceDetection {
  candidate: FaceMatchCandidate | null
}

export interface FaceAnalyzeAndMatchResponse {
  ok: true
  modelId: string
  faces: FaceDetectionWithCandidate[]
}

export interface FaceAnalyzeAndMatchErrorResponse {
  ok: false
  error: string
}

export interface FaceEmbeddingMetaRow {
  embeddingId: number
  personId: number
  name: string
  modelId: string | null
  embeddingDim: number
  createdAt: string
}

export interface FaceReplaceEmbeddingPayload {
  embeddingId: number
  descriptor: number[]
  modelId: string
}

export interface FacePersonProfile {
  personId: number
  medoid: Float32Array
  trimmedMean: Float32Array
  sampleCount: number
  lastUpdated: string
}

/** Raster text layer from renderer (PNG data URL); position in base-image pixels. */
export interface WatermarkTextOverlayPayload {
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
}

export interface WatermarkExportPayload {
  baseImagePath: string
  watermarkImagePath: string
  previewBaseImageDataUrl?: string
  blurPreviewScale?: number
  x: number
  y: number
  width: number
  height: number
  opacity: number
  toolMode?: 'none' | 'crop' | 'blur'
  selectionShape?: SelectionShape
  selectionX?: number
  selectionY?: number
  selectionWidth?: number
  selectionHeight?: number
  blurStrength?: number
  blurFeather?: number
  focusSeparation?: number
  /** Optional text drawn in renderer as PNG; composited after watermark. */
  textOverlay?: WatermarkTextOverlayPayload
}

export type SelectionShape = 'rect' | 'circle'

export interface BlurSelection {
  x: number
  y: number
  width: number
  height: number
  shape: SelectionShape
}

export interface BlurParams {
  blurStrength: number
  blurFeather: number
  focusSeparation: number
}

export interface WatermarkPreviewPayload {
  baseImagePath: string
  toolMode?: 'none' | 'crop' | 'blur'
  selectionShape?: SelectionShape
  selectionX?: number
  selectionY?: number
  selectionWidth?: number
  selectionHeight?: number
  blurStrength?: number
  blurFeather?: number
  focusSeparation?: number
}

/** ייצוא קטע וידאו עם סימן מים (ללא כלי חיתוך/טשטוש על הפריים). */
export interface WatermarkVideoExportPayload {
  baseVideoPath: string
  watermarkImagePath: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  startSec: number
  endSec: number
  textOverlay?: WatermarkTextOverlayPayload
}

export type WatermarkExportResult =
  | { ok: true; filePath: string }
  | { ok: false; cancelled?: true; error?: string }
