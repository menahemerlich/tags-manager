export interface AppSettings {
  githubRepo: string
}

export type PathKind = 'file' | 'folder'

export interface TagRow {
  id: number
  name: string
  created_at: string
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
