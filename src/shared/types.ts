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
