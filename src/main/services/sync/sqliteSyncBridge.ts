import { randomUUID } from 'node:crypto'
import type { Database } from 'sql.js'
import { SYNC_TABLES } from '../../schema/syncMigration'

type SyncTableName = (typeof SYNC_TABLES)[number]

function rowFromStmt(stmt: { get: () => unknown[]; getColumnNames?: () => string[] }, columnNames: string[]): Record<string, unknown> {
  const vals = stmt.get()
  const out: Record<string, unknown> = {}
  for (let i = 0; i < columnNames.length; i += 1) {
    const v = vals[i]
    out[columnNames[i]] = v instanceof Uint8Array ? new Uint8Array(v) : v
  }
  return out
}

export class SqliteSyncBridge {
  constructor(private readonly db: Database) {}

  listColumnNames(table: SyncTableName): string[] {
    const info = this.db.exec(`PRAGMA table_info(${table})`)
    const names: string[] = []
    for (const row of info[0]?.values ?? []) {
      if (typeof row[1] === 'string') names.push(row[1])
    }
    return names
  }

  /** Rows that need to be pushed (changed after sinceIso). If sinceIso is null, all rows. */
  exportForPush(table: SyncTableName, sinceIso: string | null): Record<string, unknown>[] {
    const t = sinceIso && sinceIso.length > 0 ? sinceIso : null
    const sql =
      t === null
        ? `SELECT * FROM ${table} WHERE uuid IS NOT NULL AND uuid <> ''`
        : `SELECT * FROM ${table} WHERE uuid IS NOT NULL AND uuid <> '' AND COALESCE(updated_at, created_at, '') > ?`
    const stmt = this.db.prepare(sql)
    if (t !== null) stmt.bind([t])
    const cols = this.listColumnNames(table)
    const out: Record<string, unknown>[] = []
    while (stmt.step()) {
      out.push(rowFromStmt(stmt, cols))
    }
    stmt.free()
    return out
  }

  countPendingPush(table: SyncTableName, sinceIso: string | null): number {
    const t = sinceIso && sinceIso.length > 0 ? sinceIso : null
    const sql =
      t === null
        ? `SELECT COUNT(*) FROM ${table} WHERE uuid IS NOT NULL AND uuid <> ''`
        : `SELECT COUNT(*) FROM ${table} WHERE uuid IS NOT NULL AND uuid <> '' AND COALESCE(updated_at, created_at, '') > ?`
    const stmt = this.db.prepare(sql)
    if (t !== null) stmt.bind([t])
    let n = 0
    if (stmt.step()) {
      const v = stmt.get()[0]
      n = typeof v === 'number' ? v : Number(v)
    }
    stmt.free()
    return n
  }

  getRowByUuid(table: SyncTableName, uuid: string): Record<string, unknown> | null {
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE uuid = ?`)
    stmt.bind([uuid])
    if (!stmt.step()) {
      stmt.free()
      return null
    }
    const cols = this.listColumnNames(table)
    const row = rowFromStmt(stmt, cols)
    stmt.free()
    return row
  }

  applyRemoteRow(table: SyncTableName, row: Record<string, unknown>): void {
    const u = String(row.uuid ?? '')
    if (!u) throw new Error(`applyRemoteRow: missing uuid for ${table}`)

    switch (table) {
      case 'tags':
        this.applyTags(row, u)
        return
      case 'paths':
        this.applyPaths(row, u)
        return
      case 'tag_folders':
        this.applyTagFolders(row, u)
        return
      case 'face_people':
        this.applyFacePeople(row, u)
        return
      case 'path_tags':
        this.applyPathTags(row, u)
        return
      case 'path_tag_exclusions':
        this.applyPathTagExclusions(row, u)
        return
      case 'tag_folder_tags':
        this.applyTagFolderTags(row, u)
        return
      case 'face_embeddings':
        this.applyFaceEmbeddings(row, u)
        return
      case 'person_profiles':
        this.applyPersonProfiles(row, u)
        return
      default:
        throw new Error(`Unknown sync table: ${table}`)
    }
  }

  private applyTags(row: Record<string, unknown>, uuid: string): void {
    const name = String(row.name ?? '')
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT id FROM tags WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE tags SET name = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [name, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
    } else {
      this.db.run(
        `INSERT INTO tags (name, created_at, updated_at, uuid, deleted_at) VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)`,
        [name, created_at, updated_at ?? new Date().toISOString(), uuid, deleted_at]
      )
    }
  }

  private applyPaths(row: Record<string, unknown>, uuid: string): void {
    const path = String(row.path ?? '')
    const kind = row.kind === 'folder' ? 'folder' : 'file'
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT id FROM paths WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE paths SET path = ?, kind = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [path, kind, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
    } else {
      this.db.run(
        `INSERT INTO paths (path, kind, updated_at, created_at, uuid, deleted_at) VALUES (?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')), ?, ?)`,
        [path, kind, updated_at, created_at, uuid, deleted_at]
      )
    }
  }

  private applyTagFolders(row: Record<string, unknown>, uuid: string): void {
    const name = String(row.name ?? '')
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT id FROM tag_folders WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE tag_folders SET name = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [name, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
    } else {
      this.db.run(
        `INSERT INTO tag_folders (name, created_at, updated_at, uuid, deleted_at) VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)`,
        [name, created_at, updated_at ?? new Date().toISOString(), uuid, deleted_at]
      )
    }
  }

  private applyFacePeople(row: Record<string, unknown>, uuid: string): void {
    const name = String(row.name ?? '')
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT id FROM face_people WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE face_people SET name = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [name, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
    } else {
      this.db.run(
        `INSERT INTO face_people (name, created_at, updated_at, uuid, deleted_at) VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)`,
        [name, created_at, updated_at ?? new Date().toISOString(), uuid, deleted_at]
      )
    }
  }

  private resolvePathId(pathUuid: string): number | null {
    const st = this.db.prepare('SELECT id FROM paths WHERE uuid = ?')
    st.bind([pathUuid])
    let id: number | null = null
    if (st.step()) id = Number(st.get()[0])
    st.free()
    return id
  }

  private resolveTagId(tagUuid: string): number | null {
    const st = this.db.prepare('SELECT id FROM tags WHERE uuid = ?')
    st.bind([tagUuid])
    let id: number | null = null
    if (st.step()) id = Number(st.get()[0])
    st.free()
    return id
  }

  private resolveFolderId(folderUuid: string): number | null {
    const st = this.db.prepare('SELECT id FROM tag_folders WHERE uuid = ?')
    st.bind([folderUuid])
    let id: number | null = null
    if (st.step()) id = Number(st.get()[0])
    st.free()
    return id
  }

  private resolvePersonId(personUuid: string): number | null {
    const st = this.db.prepare('SELECT id FROM face_people WHERE uuid = ?')
    st.bind([personUuid])
    let id: number | null = null
    if (st.step()) id = Number(st.get()[0])
    st.free()
    return id
  }

  private applyPathTags(row: Record<string, unknown>, uuid: string): void {
    const pathUuid = String(row.path_uuid ?? '')
    const tagUuid = String(row.tag_uuid ?? '')
    const pathId = this.resolvePathId(pathUuid)
    const tagId = this.resolveTagId(tagUuid)
    if (pathId === null || tagId === null) {
      throw new Error(`applyPathTags: missing path or tag for uuid=${uuid}`)
    }
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const ex = this.db.prepare('SELECT 1 FROM path_tags WHERE uuid = ?')
    ex.bind([uuid])
    const hasUuid = ex.step()
    ex.free()
    if (hasUuid) {
      this.db.run(
        `UPDATE path_tags SET path_id = ?, tag_id = ?, path_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [pathId, tagId, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
      return
    }
    const ex2 = this.db.prepare('SELECT 1 FROM path_tags WHERE path_id = ? AND tag_id = ?')
    ex2.bind([pathId, tagId])
    if (ex2.step()) {
      ex2.free()
      this.db.run(
        `UPDATE path_tags SET uuid = ?, path_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE path_id = ? AND tag_id = ?`,
        [uuid, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, pathId, tagId]
      )
      return
    }
    ex2.free()
    this.db.run(
      `INSERT INTO path_tags (path_id, tag_id, uuid, path_uuid, tag_uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`,
      [pathId, tagId, uuid, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at]
    )
  }

  private applyPathTagExclusions(row: Record<string, unknown>, uuid: string): void {
    const pathUuid = String(row.path_uuid ?? '')
    const tagUuid = String(row.tag_uuid ?? '')
    const pathId = this.resolvePathId(pathUuid)
    const tagId = this.resolveTagId(tagUuid)
    if (pathId === null || tagId === null) {
      throw new Error(`applyPathTagExclusions: missing path or tag for uuid=${uuid}`)
    }
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const ex = this.db.prepare('SELECT 1 FROM path_tag_exclusions WHERE uuid = ?')
    ex.bind([uuid])
    const hasUuid = ex.step()
    ex.free()
    if (hasUuid) {
      this.db.run(
        `UPDATE path_tag_exclusions SET path_id = ?, tag_id = ?, path_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [pathId, tagId, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
      return
    }
    const ex2 = this.db.prepare('SELECT 1 FROM path_tag_exclusions WHERE path_id = ? AND tag_id = ?')
    ex2.bind([pathId, tagId])
    if (ex2.step()) {
      ex2.free()
      this.db.run(
        `UPDATE path_tag_exclusions SET uuid = ?, path_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE path_id = ? AND tag_id = ?`,
        [uuid, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, pathId, tagId]
      )
      return
    }
    ex2.free()
    this.db.run(
      `INSERT INTO path_tag_exclusions (path_id, tag_id, uuid, path_uuid, tag_uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`,
      [pathId, tagId, uuid, pathUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at]
    )
  }

  private applyTagFolderTags(row: Record<string, unknown>, uuid: string): void {
    const folderUuid = String(row.folder_uuid ?? '')
    const tagUuid = String(row.tag_uuid ?? '')
    const folderId = this.resolveFolderId(folderUuid)
    const tagId = this.resolveTagId(tagUuid)
    if (folderId === null || tagId === null) {
      throw new Error(`applyTagFolderTags: missing folder or tag for uuid=${uuid}`)
    }
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const ex = this.db.prepare('SELECT 1 FROM tag_folder_tags WHERE uuid = ?')
    ex.bind([uuid])
    const hasUuid = ex.step()
    ex.free()
    if (hasUuid) {
      this.db.run(
        `UPDATE tag_folder_tags SET folder_id = ?, tag_id = ?, folder_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [folderId, tagId, folderUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, uuid]
      )
      return
    }
    const ex2 = this.db.prepare('SELECT 1 FROM tag_folder_tags WHERE folder_id = ? AND tag_id = ?')
    ex2.bind([folderId, tagId])
    if (ex2.step()) {
      ex2.free()
      this.db.run(
        `UPDATE tag_folder_tags SET uuid = ?, folder_uuid = ?, tag_uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE folder_id = ? AND tag_id = ?`,
        [uuid, folderUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at, folderId, tagId]
      )
      return
    }
    ex2.free()
    this.db.run(
      `INSERT INTO tag_folder_tags (folder_id, tag_id, uuid, folder_uuid, tag_uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`,
      [folderId, tagId, uuid, folderUuid, tagUuid, created_at, updated_at ?? new Date().toISOString(), deleted_at]
    )
  }

  private applyFaceEmbeddings(row: Record<string, unknown>, uuid: string): void {
    const personUuid = String(row.person_uuid ?? '')
    const personId = this.resolvePersonId(personUuid)
    if (personId === null) throw new Error(`applyFaceEmbeddings: missing person for uuid=${uuid}`)
    const embedding_json = String(row.embedding_json ?? '[]')
    const model_id = row.model_id != null ? String(row.model_id) : null
    const embedding_dim =
      row.embedding_dim != null && row.embedding_dim !== '' ? Number(row.embedding_dim) : null
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT id FROM face_embeddings WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE face_embeddings SET person_id = ?, person_uuid = ?, embedding_json = ?, model_id = ?, embedding_dim = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [
          personId,
          personUuid,
          embedding_json,
          model_id,
          embedding_dim,
          created_at,
          updated_at ?? new Date().toISOString(),
          deleted_at,
          uuid
        ]
      )
    } else {
      this.db.run(
        `INSERT INTO face_embeddings (person_id, embedding_json, model_id, embedding_dim, created_at, updated_at, uuid, person_uuid, deleted_at) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
        [
          personId,
          embedding_json,
          model_id,
          embedding_dim,
          created_at,
          updated_at ?? new Date().toISOString(),
          uuid,
          personUuid,
          deleted_at
        ]
      )
    }
  }

  private applyPersonProfiles(row: Record<string, unknown>, uuid: string): void {
    const personUuid = String(row.person_uuid ?? '')
    const personId = this.resolvePersonId(personUuid)
    if (personId === null) throw new Error(`applyPersonProfiles: missing person for uuid=${uuid}`)
    const medoid = toUint8(row.medoid)
    const trimmed_mean = toUint8(row.trimmed_mean)
    if (!medoid || !trimmed_mean) throw new Error(`applyPersonProfiles: missing blobs for uuid=${uuid}`)
    const sample_count = Number(row.sample_count ?? 0)
    const last_updated = row.last_updated != null ? String(row.last_updated) : new Date().toISOString()
    const created_at = row.created_at != null ? String(row.created_at) : null
    const updated_at = row.updated_at != null ? String(row.updated_at) : null
    const deleted_at = row.deleted_at != null ? String(row.deleted_at) : null
    const st = this.db.prepare('SELECT person_id FROM person_profiles WHERE uuid = ?')
    st.bind([uuid])
    const exists = st.step()
    st.free()
    if (exists) {
      this.db.run(
        `UPDATE person_profiles SET person_id = ?, person_uuid = ?, medoid = ?, trimmed_mean = ?, sample_count = ?, last_updated = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ? WHERE uuid = ?`,
        [
          personId,
          personUuid,
          medoid,
          trimmed_mean,
          sample_count,
          last_updated,
          created_at,
          updated_at ?? new Date().toISOString(),
          deleted_at,
          uuid
        ]
      )
    } else {
      const st2 = this.db.prepare('SELECT person_id FROM person_profiles WHERE person_id = ?')
      st2.bind([personId])
      const byPerson = st2.step()
      st2.free()
      if (byPerson) {
        this.db.run(
          `UPDATE person_profiles SET medoid = ?, trimmed_mean = ?, sample_count = ?, last_updated = ?, uuid = ?, created_at = COALESCE(?, created_at), updated_at = ?, deleted_at = ?, person_uuid = ? WHERE person_id = ?`,
          [
            medoid,
            trimmed_mean,
            sample_count,
            last_updated,
            uuid,
            created_at,
            updated_at ?? new Date().toISOString(),
            deleted_at,
            personUuid,
            personId
          ]
        )
      } else {
        this.db.run(
          `INSERT INTO person_profiles (person_id, medoid, trimmed_mean, sample_count, last_updated, uuid, created_at, updated_at, deleted_at, person_uuid) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?)`,
          [
            personId,
            medoid,
            trimmed_mean,
            sample_count,
            last_updated,
            uuid,
            created_at,
            updated_at ?? new Date().toISOString(),
            deleted_at,
            personUuid
          ]
        )
      }
    }
  }
}

function toUint8(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v
  if (Buffer.isBuffer(v)) return new Uint8Array(v)
  if (typeof v === 'string') {
    if (v.startsWith('\\x')) {
      try {
        return new Uint8Array(Buffer.from(v.slice(2), 'hex'))
      } catch {
        return null
      }
    }
    try {
      const b = Buffer.from(v, 'base64')
      return new Uint8Array(b)
    } catch {
      return null
    }
  }
  return null
}

export function stripLocalIdsForRemote(table: SyncTableName, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  delete out.id
  if (table === 'path_tags' || table === 'path_tag_exclusions') {
    delete out.path_id
    delete out.tag_id
  }
  if (table === 'tag_folder_tags') {
    delete out.folder_id
    delete out.tag_id
  }
  if (table === 'face_embeddings') {
    delete out.person_id
  }
  if (table === 'person_profiles') {
    delete out.person_id
  }
  return out
}

export function serializeRowForSupabase(table: SyncTableName, row: Record<string, unknown>): Record<string, unknown> {
  const base = stripLocalIdsForRemote(table, row)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v instanceof Uint8Array) {
      out[k] = Buffer.from(v)
      continue
    }
    if (k === 'uuid' || k.endsWith('_uuid')) {
      const s = v == null ? '' : String(v).trim()
      out[k] = s.length > 0 ? s : null
      continue
    }
    out[k] = v
  }
  if (table === 'person_profiles') {
    out.medoid = Buffer.from(toUint8(row.medoid) ?? new Uint8Array())
    out.trimmed_mean = Buffer.from(toUint8(row.trimmed_mean) ?? new Uint8Array())
  }
  return out
}

export function randomConflictId(): string {
  return randomUUID()
}
