import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { ancestorDirsOfFile, isFolderAncestorOfFile, normalizePath } from '../shared/pathUtils'
import { normalizeTagName } from '../shared/tagNormalize'
import type {
  ImportConflictChoice,
  PathKind,
  SearchResult,
  SearchResultRow,
  TagExportEntry,
  TagExportJson,
  TagImportApplyPayload,
  TagImportConflict,
  TagImportPreview,
  TagRow
} from '../shared/types'

const SEARCH_RESULT_LIMIT = 5000

const require = createRequire(import.meta.url)

function sqlJsDistDir(): string {
  return dirname(require.resolve('sql.js'))
}

let sqlMod: Awaited<ReturnType<typeof initSqlJs>> | undefined

async function getSqlMod(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!sqlMod) {
    sqlMod = await initSqlJs({
      locateFile: (file: string) => join(sqlJsDistDir(), file)
    })
  }
  return sqlMod
}

function lastInsertRowid(db: Database): number {
  const r = db.exec('SELECT last_insert_rowid() AS id')
  const v = r[0]?.values?.[0]?.[0]
  return typeof v === 'number' ? v : Number(v)
}

export class TagDatabase {
  private db!: Database
  private readonly filePath: string
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private bulkMode = false

  private constructor(filePath: string) {
    this.filePath = filePath
  }

  beginBulkMode(): void {
    this.bulkMode = true
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.db.run('BEGIN TRANSACTION')
  }

  endBulkMode(): void {
    this.db.run('COMMIT')
    this.bulkMode = false
    this.flush()
  }

  static async open(filePath: string): Promise<TagDatabase> {
    const SQL = await getSqlMod()
    const t = new TagDatabase(filePath)
    if (existsSync(filePath)) {
      const buf = readFileSync(filePath)
      t.db = new SQL.Database(buf)
    } else {
      t.db = new SQL.Database()
    }
    t.db.run('PRAGMA foreign_keys = ON')
    t.initSchema()
    return t
  }

  private schedulePersist(): void {
    if (this.bulkMode) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.flush()
    }, 300)
  }

  private flush(): void {
    const data = this.db.export()
    writeFileSync(this.filePath, Buffer.from(data))
  }

  close(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.flush()
    this.db.close()
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS path_tags (
        path_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (path_id, tag_id),
        FOREIGN KEY (path_id) REFERENCES paths(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS path_tag_exclusions (
        path_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (path_id, tag_id),
        FOREIGN KEY (path_id) REFERENCES paths(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_path_tags_tag ON path_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_paths_kind ON paths(kind);
    `)
    this.schedulePersist()
  }

  upsertPath(absPath: string, kind: PathKind): number {
    const p = normalizePath(absPath)
    const stmt = this.db.prepare('SELECT id FROM paths WHERE path = ?')
    stmt.bind([p])
    let id: number | undefined
    if (stmt.step()) {
      const row = stmt.get()
      id = row[0] as number
    }
    stmt.free()
    if (id !== undefined) {
      this.db.run('UPDATE paths SET kind = ?, updated_at = datetime(\'now\') WHERE id = ?', [kind, id])
      this.schedulePersist()
      return id
    }
    this.db.run(
      'INSERT INTO paths (path, kind, updated_at) VALUES (?, ?, datetime(\'now\'))',
      [p, kind]
    )
    const newId = lastInsertRowid(this.db)
    this.schedulePersist()
    return newId
  }

  getPathId(absPath: string): number | undefined {
    const p = normalizePath(absPath)
    const stmt = this.db.prepare('SELECT id FROM paths WHERE path = ?')
    stmt.bind([p])
    let id: number | undefined
    if (stmt.step()) {
      id = stmt.get()[0] as number
    }
    stmt.free()
    return id
  }

  getPathKind(absPath: string): PathKind | undefined {
    const p = normalizePath(absPath)
    const stmt = this.db.prepare('SELECT kind FROM paths WHERE path = ?')
    stmt.bind([p])
    let k: PathKind | undefined
    if (stmt.step()) {
      k = stmt.get()[0] as PathKind
    }
    stmt.free()
    return k
  }

  deletePath(absPath: string): void {
    const p = normalizePath(absPath)
    this.db.run('DELETE FROM paths WHERE path = ?', [p])
    this.schedulePersist()
  }

  getOrCreateTag(name: string): { id: number; name: string } {
    const n = normalizeTagName(name)
    if (!n) throw new Error('Empty tag name')
    const sel = this.db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE')
    sel.bind([n])
    if (sel.step()) {
      const row = sel.get()
      sel.free()
      return { id: row[0] as number, name: row[1] as string }
    }
    sel.free()
    this.db.run('INSERT INTO tags (name) VALUES (?)', [n])
    const id = lastInsertRowid(this.db)
    this.schedulePersist()
    return { id, name: n }
  }

  listTags(): TagRow[] {
    const stmt = this.db.prepare('SELECT id, name, created_at FROM tags ORDER BY name COLLATE NOCASE')
    const out: TagRow[] = []
    while (stmt.step()) {
      const r = stmt.get()
      out.push({ id: r[0] as number, name: r[1] as string, created_at: r[2] as string })
    }
    stmt.free()
    return out
  }

  renameTag(tagId: number, newName: string): void {
    const n = normalizeTagName(newName)
    if (!n) throw new Error('Empty tag name')
    this.db.run('UPDATE tags SET name = ? WHERE id = ?', [n, tagId])
    this.schedulePersist()
  }

  deleteTag(tagId: number): void {
    this.db.run('DELETE FROM tags WHERE id = ?', [tagId])
    this.schedulePersist()
  }

  addTagToPath(pathId: number, tagId: number): void {
    this.db.run('DELETE FROM path_tag_exclusions WHERE path_id = ? AND tag_id = ?', [pathId, tagId])
    this.db.run('INSERT OR IGNORE INTO path_tags (path_id, tag_id) VALUES (?, ?)', [pathId, tagId])
    this.schedulePersist()
  }

  removeTagFromPath(pathId: number, tagId: number): void {
    this.db.run('DELETE FROM path_tags WHERE path_id = ? AND tag_id = ?', [pathId, tagId])
    this.schedulePersist()
  }

  addExclusionToPath(pathId: number, tagId: number): void {
    this.db.run('INSERT OR IGNORE INTO path_tag_exclusions (path_id, tag_id) VALUES (?, ?)', [pathId, tagId])
    this.schedulePersist()
  }

  removeExclusionFromPath(pathId: number, tagId: number): void {
    this.db.run('DELETE FROM path_tag_exclusions WHERE path_id = ? AND tag_id = ?', [pathId, tagId])
    this.schedulePersist()
  }

  setPathTags(absPath: string, tagNames: string[]): void {
    const p = normalizePath(absPath)
    const pathId = this.upsertPath(p, this.getPathKind(p) ?? 'file')
    this.db.run('DELETE FROM path_tags WHERE path_id = ?', [pathId])
    for (const raw of tagNames) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const t = this.getOrCreateTag(n)
      this.addTagToPath(pathId, t.id)
    }
    this.schedulePersist()
  }

  setPathExcludedTags(absPath: string, excludedTagNames: string[]): void {
    const p = normalizePath(absPath)
    const pathId = this.upsertPath(p, this.getPathKind(p) ?? 'file')
    this.db.run('DELETE FROM path_tag_exclusions WHERE path_id = ?', [pathId])
    for (const raw of excludedTagNames) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const t = this.getOrCreateTag(n)
      this.addExclusionToPath(pathId, t.id)
    }
    this.schedulePersist()
  }

  getDirectTagNamesForPathId(pathId: number): string[] {
    const stmt = this.db.prepare(
      `SELECT t.name FROM path_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.path_id = ?
       ORDER BY t.name COLLATE NOCASE`
    )
    stmt.bind([pathId])
    const names: string[] = []
    while (stmt.step()) {
      names.push(stmt.get()[0] as string)
    }
    stmt.free()
    return names
  }

  getDirectTagNamesForPath(absPath: string): string[] {
    const id = this.getPathId(absPath)
    if (id === undefined) return []
    return this.getDirectTagNamesForPathId(id)
  }

  getEffectiveTagNamesForPath(absPath: string): string[] {
    const norm = normalizePath(absPath)
    const kind = this.getPathKind(norm)
    // תיקיות צריכות לקבל גם תגיות בירושה מאבות (כולל החרגות מקומיות),
    // אחרת UI מציג "רק את התגיות של התיקייה" ולא את המצב האפקטיבי.
    const pathIdsToCheck = [norm, ...ancestorDirsOfFile(norm)]
    const placeholders = pathIdsToCheck.map(() => '?').join(',')
    const stmt = this.db.prepare(`SELECT id FROM paths WHERE path IN (${placeholders})`)
    stmt.bind(pathIdsToCheck)
    const pathIds: number[] = []
    while (stmt.step()) {
      pathIds.push(stmt.get()[0] as number)
    }
    stmt.free()
    if (pathIds.length === 0) return []
    const idPlaceholders = pathIds.map(() => '?').join(',')
    const tagStmt = this.db.prepare(
      `SELECT DISTINCT t.id, t.name FROM path_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.path_id IN (${idPlaceholders})`
    )
    tagStmt.bind(pathIds)
    const tagIds = new Set<number>()
    const idToName = new Map<number, string>()
    while (tagStmt.step()) {
      const r = tagStmt.get()
      tagIds.add(r[0] as number)
      idToName.set(r[0] as number, r[1] as string)
    }
    tagStmt.free()
    const pathId = this.getPathId(norm)
    if (pathId !== undefined) {
      const exclStmt = this.db.prepare(
        'SELECT tag_id FROM path_tag_exclusions WHERE path_id = ?'
      )
      exclStmt.bind([pathId])
      while (exclStmt.step()) {
        tagIds.delete(exclStmt.get()[0] as number)
      }
      exclStmt.free()
    }
    return [...tagIds]
      .map((id) => idToName.get(id))
      .filter((n): n is string => typeof n === 'string')
      .sort((a, b) => a.localeCompare(b))
  }

  private loadPathExclusionMap(): Map<string, Set<number>> {
    const stmt = this.db.prepare(
      `SELECT p.path, pte.tag_id FROM paths p
       JOIN path_tag_exclusions pte ON pte.path_id = p.id`
    )
    const m = new Map<string, Set<number>>()
    while (stmt.step()) {
      const r = stmt.get()
      const path = r[0] as string
      const tagId = r[1] as number
      let s = m.get(path)
      if (!s) {
        s = new Set()
        m.set(path, s)
      }
      s.add(tagId)
    }
    stmt.free()
    return m
  }

  private loadPathTagIdMap(): Map<string, Set<number>> {
    const stmt = this.db.prepare(
      `SELECT p.path, pt.tag_id FROM paths p
       JOIN path_tags pt ON pt.path_id = p.id`
    )
    const m = new Map<string, Set<number>>()
    while (stmt.step()) {
      const r = stmt.get()
      const path = r[0] as string
      const tagId = r[1] as number
      let s = m.get(path)
      if (!s) {
        s = new Set()
        m.set(path, s)
      }
      s.add(tagId)
    }
    stmt.free()
    return m
  }

  private loadTagIdToName(): Map<number, string> {
    const stmt = this.db.prepare('SELECT id, name FROM tags')
    const m = new Map<number, string>()
    while (stmt.step()) {
      const r = stmt.get()
      m.set(r[0] as number, r[1] as string)
    }
    stmt.free()
    return m
  }

  private loadFilePaths(): string[] {
    const stmt = this.db.prepare(`SELECT path FROM paths WHERE kind = 'file'`)
    const paths: string[] = []
    while (stmt.step()) {
      paths.push(stmt.get()[0] as string)
    }
    stmt.free()
    return paths
  }

  effectiveTagIdsForFile(
    filePath: string,
    pathTagMap: Map<string, Set<number>>,
    exclusionMap?: Map<string, Set<number>>
  ): Set<number> {
    const norm = normalizePath(filePath)
    const ids = new Set<number>(pathTagMap.get(norm) ?? [])
    for (const dir of ancestorDirsOfFile(norm)) {
      const set = pathTagMap.get(dir)
      if (set) for (const id of set) ids.add(id)
    }
    const excluded = exclusionMap?.get(norm)
    if (excluded) for (const id of excluded) ids.delete(id)
    return ids
  }

  listAllPathsWithDirectTags(): { path: string; kind: PathKind; tags: string[] }[] {
    const stmt = this.db.prepare(`SELECT id, path, kind FROM paths ORDER BY path COLLATE NOCASE`)
    const rows: { id: number; path: string; kind: PathKind }[] = []
    while (stmt.step()) {
      const r = stmt.get()
      rows.push({ id: r[0] as number, path: r[1] as string, kind: r[2] as PathKind })
    }
    stmt.free()
    return rows.map((r) => ({
      path: r.path,
      kind: r.kind,
      tags: this.getDirectTagNamesForPathId(r.id)
    }))
  }

  /** Only folders + files not inside any tracked folder — like Explorer: show selected items, not folder contents. */
  listUserVisiblePathsWithDirectTags(): { path: string; kind: PathKind; tags: string[] }[] {
    const all = this.listAllPathsWithDirectTags()
    const folderPaths = all.filter((r) => r.kind === 'folder').map((r) => r.path)
    const visible = all.filter((r) => {
      if (r.kind === 'folder') return true
      const filePath = r.path
      const underTrackedFolder = folderPaths.some((fp) => isFolderAncestorOfFile(fp, filePath))
      return !underTrackedFolder
    })
    return visible
  }

  private isPathInScope(pathValue: string, scopePath: string): boolean {
    const normPath = normalizePath(pathValue)
    const normScope = normalizePath(scopePath)
    const pathCmp = process.platform === 'win32' ? normPath.toLowerCase() : normPath
    const scopeCmp = process.platform === 'win32' ? normScope.toLowerCase() : normScope
    if (pathCmp === scopeCmp) return true
    const sep = scopeCmp.includes('\\') ? '\\' : '/'
    const prefix = /[\\/]+$/.test(scopeCmp) ? scopeCmp : scopeCmp + sep
    return pathCmp.startsWith(prefix)
  }

  private tagNamesFromIdSet(ids: Set<number> | undefined, idToName: Map<number, string>): string[] {
    if (!ids) return []
    return [...ids]
      .map((id) => idToName.get(id))
      .filter((n): n is string => typeof n === 'string')
      .sort((a, b) => a.localeCompare(b))
  }

  exportTagJsonByScope(scopePath: string): TagExportJson {
    const normalizedScope = normalizePath(scopePath)
    const idToName = this.loadTagIdToName()
    const pathTagMap = this.loadPathTagIdMap()
    const exclusionMap = this.loadPathExclusionMap()
    const stmt = this.db.prepare('SELECT path, kind FROM paths ORDER BY path COLLATE NOCASE')
    const entries: TagExportEntry[] = []
    while (stmt.step()) {
      const row = stmt.get()
      const pathValue = row[0] as string
      if (!this.isPathInScope(pathValue, normalizedScope)) continue
      const kind = row[1] as PathKind
      // לייצוא שיידע לשחזר גם תגים בירושה: ב-export נשמור ב-`directTags`
      // את סט התגיות האפקטיבי עבור הנתיב (גם אם זה folder).
      const effectiveTagIds = this.effectiveTagIdsForFile(pathValue, pathTagMap, exclusionMap)
      entries.push({
        path: pathValue,
        kind,
        // עבור קובץ: לייצא את כל התגיות האפקטיביות כך שבייבוא התגיות יהיו זמינות גם בקבצים,
        // גם אם הן הגיעו בירושה מתיקייה.
        directTags: this.tagNamesFromIdSet(effectiveTagIds, idToName),
        excludedInheritedTags: this.tagNamesFromIdSet(exclusionMap.get(pathValue), idToName)
      })
    }
    stmt.free()
    return {
      format: 'tags-manager-export-v1',
      exportedAt: new Date().toISOString(),
      scopePath: normalizedScope,
      entries
    }
  }

  private normalizeTagList(names: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of names) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(n)
    }
    return out.sort((a, b) => a.localeCompare(b))
  }

  private areSameTags(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    const aNorm = a.map((x) => x.toLowerCase()).sort((x, y) => x.localeCompare(y))
    const bNorm = b.map((x) => x.toLowerCase()).sort((x, y) => x.localeCompare(y))
    for (let i = 0; i < aNorm.length; i += 1) {
      if (aNorm[i] !== bNorm[i]) return false
    }
    return true
  }

  private unionTags(a: string[], b: string[]): string[] {
    return this.normalizeTagList([...a, ...b])
  }

  previewImportByScope(data: TagExportJson, scopePath: string): TagImportPreview {
    const normalizedScope = normalizePath(scopePath)
    const existing = this.listAllPathsWithDirectTags()
    const existingMap = new Map(existing.map((e) => [normalizePath(e.path), e]))
    const idToName = this.loadTagIdToName()
    const pathTagMap = this.loadPathTagIdMap()
    const exclusionMap = this.loadPathExclusionMap()
    let newEntries = 0
    let unchangedEntries = 0
    const conflicts: TagImportConflict[] = []

    for (const entry of data.entries) {
      const pathValue = normalizePath(entry.path)
      if (!this.isPathInScope(pathValue, normalizedScope)) continue
      const importedDirect = this.normalizeTagList(entry.directTags ?? [])
      const importedExcluded = this.normalizeTagList(entry.excludedInheritedTags ?? [])
      const existingRow = existingMap.get(pathValue)
      if (!existingRow) {
        newEntries += 1
        continue
      }
      const existingDirect =
        this.tagNamesFromIdSet(this.effectiveTagIdsForFile(pathValue, pathTagMap, exclusionMap), idToName)
      const existingExcluded = this.normalizeTagList(this.tagNamesFromIdSet(exclusionMap.get(pathValue), idToName))
      const sameKind = existingRow.kind === entry.kind
      const sameDirect = this.areSameTags(existingDirect, importedDirect)
      const sameExcluded = this.areSameTags(existingExcluded, importedExcluded)
      if (sameKind && sameDirect && sameExcluded) {
        unchangedEntries += 1
        continue
      }
      conflicts.push({
        path: pathValue,
        kind: entry.kind,
        existingDirectTags: existingDirect,
        importedDirectTags: importedDirect,
        existingExcludedInheritedTags: existingExcluded,
        importedExcludedInheritedTags: importedExcluded
      })
    }

    return {
      sourceFilePath: '',
      scopePath: normalizedScope,
      totalEntries: data.entries.filter((e) => this.isPathInScope(e.path, normalizedScope)).length,
      newEntries,
      unchangedEntries,
      conflictEntries: conflicts.length,
      conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path))
    }
  }

  async applyImportByScope(
    data: TagExportJson,
    payload: TagImportApplyPayload,
    opts?: { onProgress?: (p: { done: number; total: number }) => void }
  ): { appliedCount: number; skippedCount: number } {
    const normalizedScope = normalizePath(payload.scopePath)
    const conflictChoiceMap = new Map(
      Object.entries(payload.conflictChoicesByPath ?? {}).map(([k, v]) => [normalizePath(k), v])
    )

    // חשוב: לא נריץ preview שוב בתוך apply (כדי לא להכפיל עלות ולמנוע "לא מגיב" על scopes גדולים).
    // במקום זה נחשב התנגשויות תוך כדי ה-apply עצמו.
    const idToName = this.loadTagIdToName()
    const pathTagMap = this.loadPathTagIdMap()
    const exclusionMap = this.loadPathExclusionMap()
    const existing = this.listAllPathsWithDirectTags()
    const existingMap = new Map(existing.map((e) => [normalizePath(e.path), e]))

    const onProgress = opts?.onProgress
    const totalInScope = data.entries.reduce((acc, e) => {
      const p = normalizePath(e.path)
      return acc + (this.isPathInScope(p, normalizedScope) ? 1 : 0)
    }, 0)

    let appliedCount = 0
    let skippedCount = 0

    let idx = 0
    let doneInScope = 0
    for (const entryRaw of data.entries) {
      idx += 1
      const entryPath = normalizePath(entryRaw.path)
      if (!this.isPathInScope(entryPath, normalizedScope)) continue

      doneInScope += 1
      if (onProgress && (doneInScope === totalInScope || doneInScope % 20 === 0)) {
        onProgress({ done: doneInScope, total: totalInScope })
      }

      const importedDirect = this.normalizeTagList(entryRaw.directTags ?? [])
      const importedExcluded = this.normalizeTagList(entryRaw.excludedInheritedTags ?? [])

      const existingRow = existingMap.get(entryPath)

      const existingDirect =
        existingRow && entryRaw.kind === existingRow.kind
          ? this.tagNamesFromIdSet(this.effectiveTagIdsForFile(entryPath, pathTagMap, exclusionMap), idToName)
          : existingRow
            ? this.tagNamesFromIdSet(this.effectiveTagIdsForFile(entryPath, pathTagMap, exclusionMap), idToName)
            : []

      const existingExcluded = this.normalizeTagList(this.tagNamesFromIdSet(exclusionMap.get(entryPath), idToName))
      const sameKind = existingRow ? existingRow.kind === entryRaw.kind : false
      const sameDirect = existingRow ? this.areSameTags(existingDirect, importedDirect) : false
      const sameExcluded = existingRow ? this.areSameTags(existingExcluded, importedExcluded) : false
      const isConflict = existingRow ? !(sameKind && sameDirect && sameExcluded) : false

      if (isConflict) {
        const choice: ImportConflictChoice = conflictChoiceMap.get(entryPath) ?? payload.defaultConflictChoice
        if (choice === 'skip') {
          skippedCount += 1
          continue
        }
        if (choice === 'merge') {
          const mergedDirect = this.unionTags(existingDirect, importedDirect)
          const mergedExcluded = this.unionTags(existingExcluded, importedExcluded)
          this.upsertPath(entryPath, entryRaw.kind)
          this.setPathTags(entryPath, mergedDirect)
          this.setPathExcludedTags(entryPath, mergedExcluded)
          appliedCount += 1
          continue
        }
        // replace
      }

      // new entry or non-conflicting replace.
      this.upsertPath(entryPath, entryRaw.kind)
      this.setPathTags(entryPath, importedDirect)
      this.setPathExcludedTags(entryPath, importedExcluded)
      appliedCount += 1

      // כדי לא לחסום את ה-EventLoop בלוקים גדולים (מונע "לא מגיב"/מסך לבן).
      // לא מייצר async overhead משמעותי כי זה קורה רק כל N רשומות.
      if (idx % 200 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    onProgress?.({ done: doneInScope, total: totalInScope })
    return { appliedCount, skippedCount }
  }

  searchFilesByTagIds(requiredTagIds: number[]): SearchResult {
    const idToName = this.loadTagIdToName()
    const pathTagMap = this.loadPathTagIdMap()
    const exclusionMap = this.loadPathExclusionMap()
    const files = this.loadFilePaths()

    if (requiredTagIds.length === 0) {
      const rows = files.slice(0, SEARCH_RESULT_LIMIT).map((fp) => ({
        path: fp,
        kind: 'file' as const,
        tags: [...this.effectiveTagIdsForFile(fp, pathTagMap, exclusionMap)]
          .map((id) => idToName.get(id))
          .filter((n): n is string => n !== undefined)
          .sort((a, b) => a.localeCompare(b))
      }))
      return { rows, truncated: files.length > SEARCH_RESULT_LIMIT }
    }

    const required = new Set(requiredTagIds)
    const out: SearchResultRow[] = []

    for (const fp of files) {
      if (out.length >= SEARCH_RESULT_LIMIT) break
      const eff = this.effectiveTagIdsForFile(fp, pathTagMap, exclusionMap)
      let ok = true
      for (const tid of required) {
        if (!eff.has(tid)) {
          ok = false
          break
        }
      }
      if (!ok) continue
      out.push({
        path: fp,
        kind: 'file',
        tags: [...eff]
          .map((id) => idToName.get(id))
          .filter((n): n is string => n !== undefined)
          .sort((a, b) => a.localeCompare(b))
      })
    }
    const rows = out.sort((a, b) => a.path.localeCompare(b.path))
    return { rows, truncated: files.length > 0 && out.length >= SEARCH_RESULT_LIMIT }
  }

  tagIdsByNames(names: string[]): number[] {
    const ids: number[] = []
    for (const raw of names) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const stmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE')
      stmt.bind([n])
      if (stmt.step()) ids.push(stmt.get()[0] as number)
      stmt.free()
    }
    return ids
  }

  getTagIdByName(name: string): number | undefined {
    const n = normalizeTagName(name)
    if (!n) return undefined
    const stmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE')
    stmt.bind([n])
    let id: number | undefined
    if (stmt.step()) {
      id = stmt.get()[0] as number
    }
    stmt.free()
    return id
  }
}
