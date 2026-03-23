export interface AppSettings {
  githubRepo: string
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

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  isNewer: boolean
  error?: string
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
