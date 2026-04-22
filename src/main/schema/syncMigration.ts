import { randomUUID } from 'node:crypto'
import type { Database } from 'sql.js'

const SYNC_TABLES = [
  'tags',
  'paths',
  'path_tags',
  'path_tag_exclusions',
  'tag_folders',
  'tag_folder_tags',
  'face_people',
  'face_embeddings',
  'person_profiles'
] as const

export function discoverUserTables(db: Database): { name: string; sql: string | null }[] {
  const r = db.exec(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const out: { name: string; sql: string | null }[] = []
  const rows = r[0]?.values ?? []
  for (const row of rows) {
    out.push({ name: String(row[0]), sql: row[1] != null ? String(row[1]) : null })
  }
  return out
}

function tableHasColumn(db: Database, table: string, col: string): boolean {
  const info = db.exec(`PRAGMA table_info(${table})`)
  const names = new Set<string>()
  for (const row of info[0]?.values ?? []) {
    if (typeof row[1] === 'string') names.add(row[1])
  }
  return names.has(col)
}

function addColumn(db: Database, table: string, ddl: string): void {
  try {
    db.run(ddl)
  } catch {
    // ignore duplicate
  }
}

/**
 * Adds uuid, created_at, updated_at, deleted_at to all app tables; backfills uuid.
 */
export function migrateSyncSchema(db: Database): void {
  // tags
  if (!tableHasColumn(db, 'tags', 'uuid')) addColumn(db, 'tags', 'ALTER TABLE tags ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'tags', 'updated_at')) addColumn(db, 'tags', 'ALTER TABLE tags ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'tags', 'deleted_at')) addColumn(db, 'tags', 'ALTER TABLE tags ADD COLUMN deleted_at TEXT')

  // paths
  if (!tableHasColumn(db, 'paths', 'uuid')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'paths', 'created_at')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN created_at TEXT')
  if (!tableHasColumn(db, 'paths', 'deleted_at')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN deleted_at TEXT')
  // Identity (move/rename resilience)
  if (!tableHasColumn(db, 'paths', 'file_id')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN file_id TEXT')
  if (!tableHasColumn(db, 'paths', 'fingerprint')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN fingerprint TEXT')
  if (!tableHasColumn(db, 'paths', 'size_bytes')) addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN size_bytes INTEGER')
  if (!tableHasColumn(db, 'paths', 'fingerprint_updated_at')) {
    addColumn(db, 'paths', 'ALTER TABLE paths ADD COLUMN fingerprint_updated_at TEXT')
  }

  // path_tags
  if (!tableHasColumn(db, 'path_tags', 'uuid')) addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'path_tags', 'created_at')) addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN created_at TEXT')
  if (!tableHasColumn(db, 'path_tags', 'updated_at')) addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'path_tags', 'deleted_at')) addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN deleted_at TEXT')

  // path_tag_exclusions
  if (!tableHasColumn(db, 'path_tag_exclusions', 'uuid')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN uuid TEXT')
  }
  if (!tableHasColumn(db, 'path_tag_exclusions', 'created_at')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN created_at TEXT')
  }
  if (!tableHasColumn(db, 'path_tag_exclusions', 'updated_at')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN updated_at TEXT')
  }
  if (!tableHasColumn(db, 'path_tag_exclusions', 'deleted_at')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN deleted_at TEXT')
  }

  // tag_folders
  if (!tableHasColumn(db, 'tag_folders', 'uuid')) addColumn(db, 'tag_folders', 'ALTER TABLE tag_folders ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'tag_folders', 'updated_at')) addColumn(db, 'tag_folders', 'ALTER TABLE tag_folders ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'tag_folders', 'deleted_at')) addColumn(db, 'tag_folders', 'ALTER TABLE tag_folders ADD COLUMN deleted_at TEXT')

  // tag_folder_tags
  if (!tableHasColumn(db, 'tag_folder_tags', 'uuid')) addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'tag_folder_tags', 'created_at')) addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN created_at TEXT')
  if (!tableHasColumn(db, 'tag_folder_tags', 'updated_at')) addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'tag_folder_tags', 'deleted_at')) addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN deleted_at TEXT')

  // face_people
  if (!tableHasColumn(db, 'face_people', 'uuid')) addColumn(db, 'face_people', 'ALTER TABLE face_people ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'face_people', 'updated_at')) addColumn(db, 'face_people', 'ALTER TABLE face_people ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'face_people', 'deleted_at')) addColumn(db, 'face_people', 'ALTER TABLE face_people ADD COLUMN deleted_at TEXT')

  // face_embeddings
  if (!tableHasColumn(db, 'face_embeddings', 'uuid')) addColumn(db, 'face_embeddings', 'ALTER TABLE face_embeddings ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'face_embeddings', 'updated_at')) addColumn(db, 'face_embeddings', 'ALTER TABLE face_embeddings ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'face_embeddings', 'deleted_at')) addColumn(db, 'face_embeddings', 'ALTER TABLE face_embeddings ADD COLUMN deleted_at TEXT')

  // person_profiles
  if (!tableHasColumn(db, 'person_profiles', 'uuid')) addColumn(db, 'person_profiles', 'ALTER TABLE person_profiles ADD COLUMN uuid TEXT')
  if (!tableHasColumn(db, 'person_profiles', 'created_at')) addColumn(db, 'person_profiles', 'ALTER TABLE person_profiles ADD COLUMN created_at TEXT')
  if (!tableHasColumn(db, 'person_profiles', 'updated_at')) addColumn(db, 'person_profiles', 'ALTER TABLE person_profiles ADD COLUMN updated_at TEXT')
  if (!tableHasColumn(db, 'person_profiles', 'deleted_at')) addColumn(db, 'person_profiles', 'ALTER TABLE person_profiles ADD COLUMN deleted_at TEXT')

  // Defaults for updated_at where null
  db.run(`UPDATE tags SET updated_at = created_at WHERE updated_at IS NULL`)
  db.run(`UPDATE paths SET created_at = updated_at WHERE created_at IS NULL`)
  db.run(`UPDATE tag_folders SET updated_at = created_at WHERE updated_at IS NULL`)
  db.run(`UPDATE face_people SET updated_at = created_at WHERE updated_at IS NULL`)
  db.run(`UPDATE face_embeddings SET updated_at = created_at WHERE updated_at IS NULL`)
  db.run(`UPDATE person_profiles SET created_at = last_updated, updated_at = last_updated WHERE created_at IS NULL`)

  // path_tags / exclusions / tag_folder_tags timestamps
  db.run(`UPDATE path_tags SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL`)
  db.run(`UPDATE path_tag_exclusions SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL`)
  db.run(`UPDATE tag_folder_tags SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL`)

  // Backfill uuid (per-row keys for composite tables)
  const backfillSimple = (table: string, pkCol: string) => {
    const stmt = db.prepare(`SELECT ${pkCol} FROM ${table} WHERE uuid IS NULL OR uuid = ''`)
    const ids: unknown[] = []
    while (stmt.step()) ids.push(stmt.get()[0])
    stmt.free()
    for (const id of ids) {
      db.run(`UPDATE ${table} SET uuid = ? WHERE ${pkCol} = ?`, [randomUUID(), id])
    }
  }
  backfillSimple('tags', 'id')
  backfillSimple('paths', 'id')
  backfillSimple('tag_folders', 'id')
  backfillSimple('face_people', 'id')
  backfillSimple('face_embeddings', 'id')
  backfillSimple('person_profiles', 'person_id')

  // Identity indexes (partial unique where possible; ignore if unsupported)
  try {
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_paths_file_id_alive
       ON paths(file_id) WHERE deleted_at IS NULL AND file_id IS NOT NULL AND file_id != ''`
    )
  } catch {
    // ignore (older sqlite variants)
  }
  try {
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_paths_fingerprint_alive
       ON paths(fingerprint) WHERE deleted_at IS NULL AND fingerprint IS NOT NULL AND fingerprint != ''`
    )
  } catch {
    // ignore
  }

  const pt = db.prepare(`SELECT path_id, tag_id FROM path_tags WHERE uuid IS NULL OR uuid = ''`)
  while (pt.step()) {
    const r = pt.get()
    db.run(`UPDATE path_tags SET uuid = ? WHERE path_id = ? AND tag_id = ?`, [randomUUID(), r[0], r[1]])
  }
  pt.free()

  const pe = db.prepare(`SELECT path_id, tag_id FROM path_tag_exclusions WHERE uuid IS NULL OR uuid = ''`)
  while (pe.step()) {
    const r = pe.get()
    db.run(`UPDATE path_tag_exclusions SET uuid = ? WHERE path_id = ? AND tag_id = ?`, [randomUUID(), r[0], r[1]])
  }
  pe.free()

  const tft = db.prepare(`SELECT folder_id, tag_id FROM tag_folder_tags WHERE uuid IS NULL OR uuid = ''`)
  while (tft.step()) {
    const r = tft.get()
    db.run(`UPDATE tag_folder_tags SET uuid = ? WHERE folder_id = ? AND tag_id = ?`, [randomUUID(), r[0], r[1]])
  }
  tft.free()

  // Cross-reference UUIDs for join tables (multi-device)
  if (!tableHasColumn(db, 'path_tags', 'path_uuid')) {
    addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN path_uuid TEXT')
  }
  if (!tableHasColumn(db, 'path_tags', 'tag_uuid')) {
    addColumn(db, 'path_tags', 'ALTER TABLE path_tags ADD COLUMN tag_uuid TEXT')
  }
  db.run(`UPDATE path_tags SET path_uuid = (SELECT uuid FROM paths WHERE paths.id = path_tags.path_id) WHERE path_uuid IS NULL OR path_uuid = ''`)
  db.run(`UPDATE path_tags SET tag_uuid = (SELECT uuid FROM tags WHERE tags.id = path_tags.tag_id) WHERE tag_uuid IS NULL OR tag_uuid = ''`)

  if (!tableHasColumn(db, 'path_tag_exclusions', 'path_uuid')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN path_uuid TEXT')
  }
  if (!tableHasColumn(db, 'path_tag_exclusions', 'tag_uuid')) {
    addColumn(db, 'path_tag_exclusions', 'ALTER TABLE path_tag_exclusions ADD COLUMN tag_uuid TEXT')
  }
  db.run(
    `UPDATE path_tag_exclusions SET path_uuid = (SELECT uuid FROM paths WHERE paths.id = path_tag_exclusions.path_id) WHERE path_uuid IS NULL OR path_uuid = ''`
  )
  db.run(
    `UPDATE path_tag_exclusions SET tag_uuid = (SELECT uuid FROM tags WHERE tags.id = path_tag_exclusions.tag_id) WHERE tag_uuid IS NULL OR tag_uuid = ''`
  )

  if (!tableHasColumn(db, 'tag_folder_tags', 'folder_uuid')) {
    addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN folder_uuid TEXT')
  }
  if (!tableHasColumn(db, 'tag_folder_tags', 'tag_uuid')) {
    addColumn(db, 'tag_folder_tags', 'ALTER TABLE tag_folder_tags ADD COLUMN tag_uuid TEXT')
  }
  db.run(
    `UPDATE tag_folder_tags SET folder_uuid = (SELECT uuid FROM tag_folders WHERE tag_folders.id = tag_folder_tags.folder_id) WHERE folder_uuid IS NULL OR folder_uuid = ''`
  )
  db.run(
    `UPDATE tag_folder_tags SET tag_uuid = (SELECT uuid FROM tags WHERE tags.id = tag_folder_tags.tag_id) WHERE tag_uuid IS NULL OR tag_uuid = ''`
  )

  if (!tableHasColumn(db, 'face_embeddings', 'person_uuid')) {
    addColumn(db, 'face_embeddings', 'ALTER TABLE face_embeddings ADD COLUMN person_uuid TEXT')
  }
  db.run(
    `UPDATE face_embeddings SET person_uuid = (SELECT uuid FROM face_people WHERE face_people.id = face_embeddings.person_id) WHERE person_uuid IS NULL OR person_uuid = ''`
  )

  if (!tableHasColumn(db, 'person_profiles', 'person_uuid')) {
    addColumn(db, 'person_profiles', 'ALTER TABLE person_profiles ADD COLUMN person_uuid TEXT')
  }
  db.run(
    `UPDATE person_profiles SET person_uuid = (SELECT uuid FROM face_people WHERE face_people.id = person_profiles.person_id) WHERE person_uuid IS NULL OR person_uuid = ''`
  )

  // Sanity: expected tables exist
  const names = new Set(discoverUserTables(db).map((t) => t.name))
  for (const t of SYNC_TABLES) {
    if (!names.has(t)) {
      throw new Error(`Expected table missing after migration: ${t}`)
    }
  }
}

export type SyncTableName = (typeof SYNC_TABLES)[number]

export { SYNC_TABLES }
