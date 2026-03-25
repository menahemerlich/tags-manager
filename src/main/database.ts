import { randomUUID } from 'node:crypto'
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
  TagRow,
  TagFolderRow,
  FaceAddEmbeddingPayload,
  FaceEmbeddingMetaRow,
  FaceMatchCandidate,
  FacePersonEmbeddings,
  FaceReplaceEmbeddingPayload
} from '../shared/types'
import { FACE_EMBEDDING_MODEL_ID } from '../shared/types'
import { migrateSyncSchema } from './schema/syncMigration'
import { SqliteSyncBridge } from './services/sync/sqliteSyncBridge'

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

function toNumericArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const value of raw) {
    const num = Number(value)
    if (Number.isFinite(num)) out.push(num)
  }
  return out
}

function l2Normalize(v: number[]): number[] {
  if (v.length === 0) return v
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum)
  if (!Number.isFinite(n) || n <= 0) return v
  return v.map((x) => x / n)
}

function cosineDistance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  if (len === 0) return 1
  let dot = 0
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i]
  return 1 - dot
}

function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const len = Math.min(a.length, b.length)
  if (len === 0) return 0
  let dot = 0
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i]
  return dot
}

function average(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

function getDynamicThreshold(sampleCount: number): number {
  if (sampleCount <= 2) return 0.35
  if (sampleCount <= 5) return 0.42
  if (sampleCount <= 10) return 0.48
  return 0.52
}

function toFloat32Blob(values: Float32Array): Uint8Array {
  return new Uint8Array(values.buffer.slice(0))
}

function fromFloat32Blob(raw: unknown): Float32Array | null {
  if (!(raw instanceof Uint8Array)) return null
  if (raw.byteLength === 0 || raw.byteLength % 4 !== 0) return null
  const copy = raw.slice()
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

function vectorMean(vectors: number[][]): number[] {
  if (vectors.length === 0) return []
  const dim = vectors[0]?.length ?? 0
  if (dim === 0) return []
  const sum = new Array(dim).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dim; i += 1) sum[i] += vec[i] ?? 0
  }
  for (let i = 0; i < dim; i += 1) sum[i] /= vectors.length
  return sum
}

function toConfidenceLabel(confidence: number): 'high' | 'probable' | 'uncertain' {
  if (confidence >= 0.9) return 'high'
  if (confidence >= 0.7) return 'probable'
  return 'uncertain'
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

  persistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.flush()
  }

  /**
   * Call after tags-manager.sqlite was replaced on disk (e.g. sync pull). Reloads sql.js state
   * without flushing stale in-memory data onto the new file.
   */
  async reloadFromDisk(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.db.close()
    const SQL = await getSqlMod()
    if (existsSync(this.filePath)) {
      const buf = readFileSync(this.filePath)
      this.db = new SQL.Database(buf)
    } else {
      this.db = new SQL.Database()
    }
    this.db.run('PRAGMA foreign_keys = ON')
    this.initSchema()
  }

  close(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.flush()
    this.db.close()
  }

  private refreshPathTagUuids(pathId: number, tagId: number): void {
    this.db.run(
      `UPDATE path_tags SET path_uuid = (SELECT uuid FROM paths WHERE id = ?), tag_uuid = (SELECT uuid FROM tags WHERE id = ?) WHERE path_id = ? AND tag_id = ?`,
      [pathId, tagId, pathId, tagId]
    )
  }

  private refreshPathExclusionUuids(pathId: number, tagId: number): void {
    this.db.run(
      `UPDATE path_tag_exclusions SET path_uuid = (SELECT uuid FROM paths WHERE id = ?), tag_uuid = (SELECT uuid FROM tags WHERE id = ?) WHERE path_id = ? AND tag_id = ?`,
      [pathId, tagId, pathId, tagId]
    )
  }

  private refreshTagFolderLinkUuids(folderId: number, tagId: number): void {
    this.db.run(
      `UPDATE tag_folder_tags SET folder_uuid = (SELECT uuid FROM tag_folders WHERE id = ?), tag_uuid = (SELECT uuid FROM tags WHERE id = ?) WHERE folder_id = ? AND tag_id = ?`,
      [folderId, tagId, folderId, tagId]
    )
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

      CREATE TABLE IF NOT EXISTS tag_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tag_folder_tags (
        folder_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL UNIQUE,
        PRIMARY KEY (folder_id, tag_id),
        FOREIGN KEY (folder_id) REFERENCES tag_folders(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tag_folder_tags_folder ON tag_folder_tags(folder_id);
      CREATE INDEX IF NOT EXISTS idx_tag_folder_tags_tag ON tag_folder_tags(tag_id);

      CREATE TABLE IF NOT EXISTS face_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS face_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        embedding_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (person_id) REFERENCES face_people(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS person_profiles (
        person_id INTEGER PRIMARY KEY,
        medoid BLOB NOT NULL,
        trimmed_mean BLOB NOT NULL,
        sample_count INTEGER NOT NULL,
        last_updated TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES face_people(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_face_embeddings_person ON face_embeddings(person_id);
    `)
    this.ensureFaceEmbeddingSchema()
    migrateSyncSchema(this.db)
    this.schedulePersist()
  }

  private ensureFaceEmbeddingSchema(): void {
    const cols = this.db.exec('PRAGMA table_info(face_embeddings)')
    const names = new Set<string>()
    for (const row of cols[0]?.values ?? []) {
      const colName = row[1]
      if (typeof colName === 'string') names.add(colName)
    }

    if (!names.has('model_id')) {
      this.db.run('ALTER TABLE face_embeddings ADD COLUMN model_id TEXT')
    }
    if (!names.has('embedding_dim')) {
      this.db.run('ALTER TABLE face_embeddings ADD COLUMN embedding_dim INTEGER')
    }
  }

  upsertPath(absPath: string, kind: PathKind): number {
    const p = normalizePath(absPath)
    const stmt = this.db.prepare('SELECT id FROM paths WHERE path = ? AND deleted_at IS NULL')
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
      'INSERT INTO paths (path, kind, updated_at, created_at, uuid) VALUES (?, ?, datetime(\'now\'), datetime(\'now\'), ?)',
      [p, kind, randomUUID()]
    )
    const newId = lastInsertRowid(this.db)
    this.schedulePersist()
    return newId
  }

  getPathId(absPath: string): number | undefined {
    const p = normalizePath(absPath)
    const stmt = this.db.prepare('SELECT id FROM paths WHERE path = ? AND deleted_at IS NULL')
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
    const stmt = this.db.prepare('SELECT kind FROM paths WHERE path = ? AND deleted_at IS NULL')
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
    const stmt = this.db.prepare('SELECT id, uuid FROM paths WHERE path = ? AND deleted_at IS NULL')
    stmt.bind([p])
    if (!stmt.step()) {
      stmt.free()
      return
    }
    const row = stmt.get()
    const pid = row[0] as number
    const u = String(row[1] ?? randomUUID())
    stmt.free()
    const tombstone = `${p}::__deleted__${u.slice(0, 8)}`
    this.db.run(
      `UPDATE paths SET path = ?, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [tombstone, pid]
    )
    this.schedulePersist()
  }

  getOrCreateTag(name: string): { id: number; name: string } {
    const n = normalizeTagName(name)
    if (!n) throw new Error('Empty tag name')
    const sel = this.db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL')
    sel.bind([n])
    if (sel.step()) {
      const row = sel.get()
      sel.free()
      return { id: row[0] as number, name: row[1] as string }
    }
    sel.free()
    this.db.run(
      `INSERT INTO tags (name, created_at, updated_at, uuid) VALUES (?, datetime('now'), datetime('now'), ?)`,
      [n, randomUUID()]
    )
    const id = lastInsertRowid(this.db)
    this.schedulePersist()
    return { id, name: n }
  }

  private getOrCreateFacePerson(name: string): { id: number; name: string } {
    const n = normalizeTagName(name)
    if (!n) throw new Error('Empty person name')
    const sel = this.db.prepare('SELECT id, name FROM face_people WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL')
    sel.bind([n])
    if (sel.step()) {
      const row = sel.get()
      sel.free()
      return { id: row[0] as number, name: row[1] as string }
    }
    sel.free()
    this.db.run(
      `INSERT INTO face_people (name, created_at, updated_at, uuid) VALUES (?, datetime('now'), datetime('now'), ?)`,
      [n, randomUUID()]
    )
    const id = lastInsertRowid(this.db)
    this.schedulePersist()
    return { id, name: n }
  }

  private listPersonEmbeddingsForModel(personId: number, modelId: string, expectedDim?: number): number[][] {
    const stmt = this.db.prepare(
      `SELECT embedding_json, embedding_dim, model_id
       FROM face_embeddings
       WHERE person_id = ? AND deleted_at IS NULL
       ORDER BY id`
    )
    stmt.bind([personId])
    const embeddings: number[][] = []
    while (stmt.step()) {
      const row = stmt.get()
      const embeddingRaw = row[0]
      const rowDim = typeof row[1] === 'number' ? row[1] : Number(row[1] ?? 0)
      const rowModelId = typeof row[2] === 'string' ? row[2] : null
      if (rowModelId && rowModelId !== modelId) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(String(embeddingRaw)) as unknown
      } catch {
        parsed = null
      }
      const emb = l2Normalize(toNumericArray(parsed))
      if (emb.length === 0) continue
      const dim = rowDim > 0 ? rowDim : emb.length
      if (expectedDim !== undefined && dim !== expectedDim) continue
      embeddings.push(emb)
    }
    stmt.free()
    return embeddings
  }

  private recomputePersonProfile(personId: number, modelId: string, expectedDim?: number): void {
    const embeddings = this.listPersonEmbeddingsForModel(personId, modelId, expectedDim)
    if (embeddings.length === 0) {
      this.db.run(
        `UPDATE person_profiles SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE person_id = ? AND deleted_at IS NULL`,
        [personId]
      )
      return
    }

    const dim = embeddings[0]?.length ?? 0
    if (dim === 0) return

    const centroid = l2Normalize(vectorMean(embeddings))
    const removeCount = Math.floor(embeddings.length * 0.1)
    const ranked = embeddings
      .map((emb, idx) => ({ idx, dist: cosineDistance(emb, centroid) }))
      .sort((a, b) => b.dist - a.dist)
    const outlierIdx = new Set<number>(ranked.slice(0, removeCount).map((x) => x.idx))
    const trimmedVectors = embeddings.filter((_, idx) => !outlierIdx.has(idx))
    const baseVectors = trimmedVectors.length > 0 ? trimmedVectors : embeddings
    const trimmedMean = new Float32Array(l2Normalize(vectorMean(baseVectors)))

    let medoid = embeddings[0]
    let medoidScore = Number.POSITIVE_INFINITY
    for (let i = 0; i < embeddings.length; i += 1) {
      const current = embeddings[i]
      let sumDist = 0
      for (let j = 0; j < embeddings.length; j += 1) {
        if (i === j) continue
        sumDist += cosineDistance(current, embeddings[j])
      }
      const avgDist = embeddings.length > 1 ? sumDist / (embeddings.length - 1) : 0
      if (avgDist < medoidScore) {
        medoidScore = avgDist
        medoid = current
      }
    }
    const medoidVec = new Float32Array(medoid)

    const pu = this.db.prepare('SELECT uuid FROM face_people WHERE id = ?')
    pu.bind([personId])
    let personUuid = ''
    if (pu.step()) personUuid = String(pu.get()[0] ?? '')
    pu.free()

    this.db.run(
      `INSERT INTO person_profiles (person_id, medoid, trimmed_mean, sample_count, last_updated, uuid, created_at, updated_at, deleted_at, person_uuid)
       VALUES (?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'), NULL, ?)
       ON CONFLICT(person_id) DO UPDATE SET
         medoid = excluded.medoid,
         trimmed_mean = excluded.trimmed_mean,
         sample_count = excluded.sample_count,
         last_updated = excluded.last_updated,
         updated_at = datetime('now'),
         deleted_at = NULL,
         person_uuid = excluded.person_uuid`,
      [personId, toFloat32Blob(medoidVec), toFloat32Blob(trimmedMean), embeddings.length, randomUUID(), personUuid || null]
    )
  }

  addFaceEmbedding(payload: FaceAddEmbeddingPayload): void {
    const n = normalizeTagName(payload.name)
    if (!n) throw new Error('Empty person name')
    const descriptor = toNumericArray(payload.descriptor)
    if (descriptor.length === 0) throw new Error('Empty descriptor')
    const modelId = normalizeTagName(payload.modelId)
    if (!modelId) throw new Error('Missing modelId')
    const person = this.getOrCreateFacePerson(n)
    const descriptorJson = JSON.stringify(descriptor)
    const pu = this.db.prepare('SELECT uuid FROM face_people WHERE id = ?')
    pu.bind([person.id])
    let personUuid = ''
    if (pu.step()) personUuid = String(pu.get()[0] ?? '')
    pu.free()
    this.db.run(
      'INSERT INTO face_embeddings (person_id, embedding_json, model_id, embedding_dim, created_at, updated_at, uuid, person_uuid) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'), ?, ?)',
      [person.id, descriptorJson, modelId, descriptor.length, randomUUID(), personUuid || null]
    )
    this.recomputePersonProfile(person.id, modelId, descriptor.length)
    this.schedulePersist()
  }

  listFacePeopleEmbeddings(): FacePersonEmbeddings[] {
    const stmt = this.db.prepare(
      `SELECT p.id, p.name, e.embedding_json
       FROM face_people p
       JOIN face_embeddings e ON e.person_id = p.id AND e.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
       ORDER BY p.name COLLATE NOCASE, e.id`
    )
    const outMap = new Map<number, FacePersonEmbeddings>()
    while (stmt.step()) {
      const r = stmt.get()
      const personId = r[0] as number
      const name = r[1] as string
      const embeddingRaw = r[2] as string
      let parsed: unknown
      try {
        parsed = JSON.parse(embeddingRaw) as unknown
      } catch {
        parsed = null
      }
      const embedding = toNumericArray(parsed)
      let row = outMap.get(personId)
      if (!row) {
        row = { personId, name, embeddings: [] }
        outMap.set(personId, row)
      }
      row.embeddings.push(embedding)
    }
    stmt.free()
    return [...outMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  matchFaceDescriptors(descriptors: number[][], modelId = FACE_EMBEDDING_MODEL_ID): (FaceMatchCandidate | null)[] {
    const queryDescs = descriptors.map((d) => {
      const normalized = l2Normalize(toNumericArray(d))
      return normalized.length > 0 ? normalized : null
    })
    const firstValid = queryDescs.find((d) => d !== null)
    if (!firstValid) return queryDescs.map(() => null)

    const dim = firstValid.length
    if (dim === 0) return queryDescs.map(() => null)

    const profilesStmt = this.db.prepare(
      `SELECT person_id, medoid, trimmed_mean, sample_count, last_updated
       FROM person_profiles
       WHERE deleted_at IS NULL`
    )
    const profilesByPerson = new Map<number, { medoid: Float32Array; trimmedMean: Float32Array; sampleCount: number }>()
    while (profilesStmt.step()) {
      const row = profilesStmt.get()
      const personId = Number(row[0])
      const medoid = fromFloat32Blob(row[1])
      const trimmedMean = fromFloat32Blob(row[2])
      const sampleCount = Number(row[3] ?? 0)
      if (!medoid || !trimmedMean) continue
      if (medoid.length !== dim || trimmedMean.length !== dim) continue
      profilesByPerson.set(personId, { medoid, trimmedMean, sampleCount })
    }
    profilesStmt.free()

    const stmt = this.db.prepare(
      `SELECT p.id, p.name, e.embedding_json, e.model_id, e.embedding_dim
       FROM face_people p
       JOIN face_embeddings e ON e.person_id = p.id AND e.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
       ORDER BY p.name COLLATE NOCASE, e.id`
    )

    const byPerson = new Map<number, { personId: number; name: string; embeddings: number[][] }>()
    while (stmt.step()) {
      const row = stmt.get()
      const personId = Number(row[0])
      const name = String(row[1])
      const embeddingRaw = row[2]
      const rowModelId = typeof row[3] === 'string' ? row[3] : null
      const rowDim = typeof row[4] === 'number' ? row[4] : Number(row[4] ?? 0)

      let parsed: unknown
      try {
        parsed = JSON.parse(String(embeddingRaw)) as unknown
      } catch {
        parsed = null
      }
      const embedding = l2Normalize(toNumericArray(parsed))
      if (embedding.length === 0) continue

      const effectiveDim = rowDim > 0 ? rowDim : embedding.length
      if (effectiveDim !== dim) continue
      if (rowModelId && rowModelId !== modelId) continue

      let person = byPerson.get(personId)
      if (!person) {
        person = { personId, name, embeddings: [] }
        byPerson.set(personId, person)
      }
      person.embeddings.push(embedding)
    }
    stmt.free()

    const prepared = [...byPerson.values()].filter((p) => p.embeddings.length > 0)
    const matches: (FaceMatchCandidate | null)[] = []

    for (const desc of queryDescs) {
      if (!desc) {
        matches.push(null)
        continue
      }
      let best: FaceMatchCandidate | null = null
      for (const person of prepared) {
        const bestIndividual = person.embeddings.reduce((acc, emb) => Math.max(acc, cosineSimilarity(desc, emb)), -1)
        const profile = profilesByPerson.get(person.personId)
        const score = profile
          ? 0.4 * cosineSimilarity(desc, profile.medoid) +
            0.4 * cosineSimilarity(desc, profile.trimmedMean) +
            0.2 * bestIndividual
          : bestIndividual
        const sampleCount = profile?.sampleCount ?? person.embeddings.length
        const threshold = getDynamicThreshold(sampleCount)
        if (score < threshold) continue

        if (!best || score > best.confidence) {
          best = {
            personId: person.personId,
            name: person.name,
            distance: 1 - score,
            sampleCount,
            confidence: score,
            threshold,
            confidenceLabel: toConfidenceLabel(score)
          }
        }
      }
      matches.push(best)
    }

    return matches
  }

  listFaceEmbeddingsMeta(): FaceEmbeddingMetaRow[] {
    const stmt = this.db.prepare(
      `SELECT e.id, p.id, p.name, e.model_id, e.embedding_dim, e.embedding_json, e.created_at
       FROM face_embeddings e
       JOIN face_people p ON p.id = e.person_id AND p.deleted_at IS NULL
       WHERE e.deleted_at IS NULL
       ORDER BY e.id`
    )
    const rows: FaceEmbeddingMetaRow[] = []
    while (stmt.step()) {
      const r = stmt.get()
      const embeddingId = Number(r[0])
      const personId = Number(r[1])
      const name = String(r[2])
      const modelId = typeof r[3] === 'string' ? r[3] : null
      const rawDim = Number(r[4] ?? 0)
      const createdAt = String(r[6])

      let parsed: unknown
      try {
        parsed = JSON.parse(String(r[5])) as unknown
      } catch {
        parsed = null
      }
      const emb = toNumericArray(parsed)
      const embeddingDim = rawDim > 0 ? rawDim : emb.length

      rows.push({ embeddingId, personId, name, modelId, embeddingDim, createdAt })
    }
    stmt.free()
    return rows
  }

  replaceFaceEmbedding(payload: FaceReplaceEmbeddingPayload): void {
    const embeddingId = Number(payload.embeddingId)
    if (!Number.isFinite(embeddingId) || embeddingId <= 0) throw new Error('Invalid embedding id')
    const descriptor = toNumericArray(payload.descriptor)
    if (descriptor.length === 0) throw new Error('Empty descriptor')
    const modelId = normalizeTagName(payload.modelId)
    if (!modelId) throw new Error('Missing modelId')
    const personStmt = this.db.prepare('SELECT person_id FROM face_embeddings WHERE id = ? AND deleted_at IS NULL')
    personStmt.bind([embeddingId])
    const personId = personStmt.step() ? Number(personStmt.get()[0]) : null
    personStmt.free()
    if (!personId) throw new Error('Embedding not found')
    this.db.run(
      'UPDATE face_embeddings SET embedding_json = ?, model_id = ?, embedding_dim = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [JSON.stringify(descriptor), modelId, descriptor.length, embeddingId]
    )
    this.recomputePersonProfile(personId, modelId, descriptor.length)
    this.schedulePersist()
  }

  listTags(): TagRow[] {
    const stmt = this.db.prepare(
      'SELECT id, name, created_at FROM tags WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE'
    )
    const out: TagRow[] = []
    while (stmt.step()) {
      const r = stmt.get()
      out.push({ id: r[0] as number, name: r[1] as string, created_at: r[2] as string })
    }
    stmt.free()
    return out
  }

  listTagFolders(): TagFolderRow[] {
    const folderStmt = this.db.prepare(
      'SELECT id, name, created_at FROM tag_folders WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE'
    )
    const folders = new Map<number, TagFolderRow>()
    while (folderStmt.step()) {
      const r = folderStmt.get()
      const id = Number(r[0])
      folders.set(id, { id, name: String(r[1]), created_at: String(r[2]), tagIds: [] })
    }
    folderStmt.free()

    if (folders.size === 0) return []

    const linkStmt = this.db.prepare(
      'SELECT folder_id, tag_id FROM tag_folder_tags WHERE deleted_at IS NULL'
    )
    while (linkStmt.step()) {
      const r = linkStmt.get()
      const folderId = Number(r[0])
      const tagId = Number(r[1])
      const folder = folders.get(folderId)
      if (!folder) continue
      folder.tagIds.push(tagId)
    }
    linkStmt.free()

    return [...folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  createTagFolder(name: string): number {
    const n = normalizeTagName(name)
    if (!n) throw new Error('Empty folder name')
    this.db.run(
      `INSERT INTO tag_folders (name, created_at, updated_at, uuid) VALUES (?, datetime('now'), datetime('now'), ?)`,
      [n, randomUUID()]
    )
    const id = lastInsertRowid(this.db)
    this.schedulePersist()
    return id
  }

  deleteTagFolder(folderId: number): void {
    const st = this.db.prepare('SELECT id, name, uuid FROM tag_folders WHERE id = ? AND deleted_at IS NULL')
    st.bind([folderId])
    if (!st.step()) {
      st.free()
      return
    }
    const r = st.get()
    st.free()
    const u = String(r[2] ?? randomUUID())
    const tomb = `${String(r[1])}::__del__${u.slice(0, 8)}`
    this.db.run(
      `UPDATE tag_folders SET name = ?, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [tomb, folderId]
    )
    this.db.run(
      `UPDATE tag_folder_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE folder_id = ? AND deleted_at IS NULL`,
      [folderId]
    )
    this.schedulePersist()
  }

  setTagFolderForTag(tagId: number, folderId: number | null): void {
    const tid = Number(tagId)
    if (!Number.isFinite(tid) || tid <= 0) throw new Error('Invalid tag id')
    this.db.run(
      `UPDATE tag_folder_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE tag_id = ? AND deleted_at IS NULL`,
      [tid]
    )
    if (folderId !== null) {
      const fid = Number(folderId)
      if (!Number.isFinite(fid) || fid <= 0) throw new Error('Invalid folder id')
      const ex = this.db.prepare(
        'SELECT 1 FROM tag_folder_tags WHERE folder_id = ? AND tag_id = ? AND deleted_at IS NULL'
      )
      ex.bind([fid, tid])
      const exists = ex.step()
      ex.free()
      if (exists) {
        this.schedulePersist()
        return
      }
      const dead = this.db.prepare(
        'SELECT 1 FROM tag_folder_tags WHERE folder_id = ? AND tag_id = ? AND deleted_at IS NOT NULL'
      )
      dead.bind([fid, tid])
      if (dead.step()) {
        dead.free()
        this.db.run(
          `UPDATE tag_folder_tags SET deleted_at = NULL, updated_at = datetime('now') WHERE folder_id = ? AND tag_id = ?`,
          [fid, tid]
        )
        this.refreshTagFolderLinkUuids(fid, tid)
      } else {
        dead.free()
        this.db.run(
          `INSERT INTO tag_folder_tags (folder_id, tag_id, uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, datetime('now'), datetime('now'), NULL)`,
          [fid, tid, randomUUID()]
        )
      }
      this.refreshTagFolderLinkUuids(fid, tid)
    }
    this.schedulePersist()
  }

  renameTag(tagId: number, newName: string): void {
    const n = normalizeTagName(newName)
    if (!n) throw new Error('Empty tag name')
    this.db.run(`UPDATE tags SET name = ?, updated_at = datetime('now') WHERE id = ?`, [n, tagId])
    this.schedulePersist()
  }

  deleteTag(tagId: number): void {
    this.db.run(
      `UPDATE path_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE tag_id = ? AND deleted_at IS NULL`,
      [tagId]
    )
    this.db.run(
      `UPDATE path_tag_exclusions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE tag_id = ? AND deleted_at IS NULL`,
      [tagId]
    )
    this.db.run(
      `UPDATE tag_folder_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE tag_id = ? AND deleted_at IS NULL`,
      [tagId]
    )
    const st = this.db.prepare('SELECT name, uuid FROM tags WHERE id = ? AND deleted_at IS NULL')
    st.bind([tagId])
    if (!st.step()) {
      st.free()
      return
    }
    const row = st.get()
    st.free()
    const u = String(row[1] ?? randomUUID())
    const tomb = `${String(row[0])}::__del__${u.slice(0, 8)}`
    this.db.run(
      `UPDATE tags SET name = ?, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [tomb, tagId]
    )
    this.schedulePersist()
  }

  addTagToPath(pathId: number, tagId: number): void {
    this.db.run(
      `UPDATE path_tag_exclusions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE path_id = ? AND tag_id = ? AND deleted_at IS NULL`,
      [pathId, tagId]
    )
    const chk = this.db.prepare(
      'SELECT 1 FROM path_tags WHERE path_id = ? AND tag_id = ? AND deleted_at IS NULL'
    )
    chk.bind([pathId, tagId])
    if (chk.step()) {
      chk.free()
      this.schedulePersist()
      return
    }
    chk.free()
    const dead = this.db.prepare(
      'SELECT 1 FROM path_tags WHERE path_id = ? AND tag_id = ? AND deleted_at IS NOT NULL'
    )
    dead.bind([pathId, tagId])
    if (dead.step()) {
      dead.free()
      this.db.run(
        `UPDATE path_tags SET deleted_at = NULL, updated_at = datetime('now') WHERE path_id = ? AND tag_id = ?`,
        [pathId, tagId]
      )
    } else {
      dead.free()
      this.db.run(
        `INSERT INTO path_tags (path_id, tag_id, uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, datetime('now'), datetime('now'), NULL)`,
        [pathId, tagId, randomUUID()]
      )
    }
    this.refreshPathTagUuids(pathId, tagId)
    this.schedulePersist()
  }

  removeTagFromPath(pathId: number, tagId: number): void {
    this.db.run(
      `UPDATE path_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE path_id = ? AND tag_id = ? AND deleted_at IS NULL`,
      [pathId, tagId]
    )
    this.schedulePersist()
  }

  addExclusionToPath(pathId: number, tagId: number): void {
    const chk = this.db.prepare(
      'SELECT 1 FROM path_tag_exclusions WHERE path_id = ? AND tag_id = ? AND deleted_at IS NULL'
    )
    chk.bind([pathId, tagId])
    if (chk.step()) {
      chk.free()
      this.schedulePersist()
      return
    }
    chk.free()
    const dead = this.db.prepare(
      'SELECT 1 FROM path_tag_exclusions WHERE path_id = ? AND tag_id = ? AND deleted_at IS NOT NULL'
    )
    dead.bind([pathId, tagId])
    if (dead.step()) {
      dead.free()
      this.db.run(
        `UPDATE path_tag_exclusions SET deleted_at = NULL, updated_at = datetime('now') WHERE path_id = ? AND tag_id = ?`,
        [pathId, tagId]
      )
    } else {
      dead.free()
      this.db.run(
        `INSERT INTO path_tag_exclusions (path_id, tag_id, uuid, created_at, updated_at, deleted_at) VALUES (?, ?, ?, datetime('now'), datetime('now'), NULL)`,
        [pathId, tagId, randomUUID()]
      )
    }
    this.refreshPathExclusionUuids(pathId, tagId)
    this.schedulePersist()
  }

  removeExclusionFromPath(pathId: number, tagId: number): void {
    this.db.run(
      `UPDATE path_tag_exclusions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE path_id = ? AND tag_id = ? AND deleted_at IS NULL`,
      [pathId, tagId]
    )
    this.schedulePersist()
  }

  setPathTags(absPath: string, tagNames: string[]): void {
    const p = normalizePath(absPath)
    const pathId = this.upsertPath(p, this.getPathKind(p) ?? 'file')
    this.db.run(
      `UPDATE path_tags SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE path_id = ? AND deleted_at IS NULL`,
      [pathId]
    )
    for (const raw of tagNames) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const t = this.getOrCreateTag(n)
      this.addTagToPath(pathId, t.id)
    }
    this.db.run(
      `UPDATE path_tags SET path_uuid = (SELECT uuid FROM paths WHERE id = path_tags.path_id), tag_uuid = (SELECT uuid FROM tags WHERE id = path_tags.tag_id) WHERE path_id = ? AND deleted_at IS NULL`,
      [pathId]
    )
    this.schedulePersist()
  }

  setPathExcludedTags(absPath: string, excludedTagNames: string[]): void {
    const p = normalizePath(absPath)
    const pathId = this.upsertPath(p, this.getPathKind(p) ?? 'file')
    this.db.run(
      `UPDATE path_tag_exclusions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE path_id = ? AND deleted_at IS NULL`,
      [pathId]
    )
    for (const raw of excludedTagNames) {
      const n = normalizeTagName(raw)
      if (!n) continue
      const t = this.getOrCreateTag(n)
      this.addExclusionToPath(pathId, t.id)
    }
    this.db.run(
      `UPDATE path_tag_exclusions SET path_uuid = (SELECT uuid FROM paths WHERE id = path_tag_exclusions.path_id), tag_uuid = (SELECT uuid FROM tags WHERE id = path_tag_exclusions.tag_id) WHERE path_id = ? AND deleted_at IS NULL`,
      [pathId]
    )
    this.schedulePersist()
  }

  getDirectTagNamesForPathId(pathId: number): string[] {
    const stmt = this.db.prepare(
      `SELECT t.name FROM path_tags pt
       JOIN tags t ON t.id = pt.tag_id AND t.deleted_at IS NULL
       WHERE pt.path_id = ? AND pt.deleted_at IS NULL
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
    const stmt = this.db.prepare(`SELECT id FROM paths WHERE path IN (${placeholders}) AND deleted_at IS NULL`)
    stmt.bind(pathIdsToCheck)
    const pathIds: number[] = []
    while (stmt.step()) {
      pathIds.push(stmt.get()[0] as number)
    }
    stmt.free()
    if (pathIds.length === 0) return []
    const idPlaceholders = pathIds.map(() => '?').join(',')
    const tagStmt = this.db.prepare(
      `SELECT DISTINCT t.id, t.name FROM path_tags pt JOIN tags t ON t.id = pt.tag_id AND t.deleted_at IS NULL
       WHERE pt.path_id IN (${idPlaceholders}) AND pt.deleted_at IS NULL`
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
        'SELECT tag_id FROM path_tag_exclusions WHERE path_id = ? AND deleted_at IS NULL'
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
       JOIN path_tag_exclusions pte ON pte.path_id = p.id AND pte.deleted_at IS NULL
       WHERE p.deleted_at IS NULL`
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
       JOIN path_tags pt ON pt.path_id = p.id AND pt.deleted_at IS NULL
       WHERE p.deleted_at IS NULL`
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
    const stmt = this.db.prepare('SELECT id, name FROM tags WHERE deleted_at IS NULL')
    const m = new Map<number, string>()
    while (stmt.step()) {
      const r = stmt.get()
      m.set(r[0] as number, r[1] as string)
    }
    stmt.free()
    return m
  }

  private loadFilePaths(): string[] {
    const stmt = this.db.prepare(`SELECT path FROM paths WHERE kind = 'file' AND deleted_at IS NULL`)
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
    const stmt = this.db.prepare(
      `SELECT id, path, kind FROM paths WHERE deleted_at IS NULL ORDER BY path COLLATE NOCASE`
    )
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
    const stmt = this.db.prepare('SELECT path, kind FROM paths WHERE deleted_at IS NULL ORDER BY path COLLATE NOCASE')
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
  ): Promise<{ appliedCount: number; skippedCount: number }> {
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
      const stmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL')
      stmt.bind([n])
      if (stmt.step()) ids.push(stmt.get()[0] as number)
      stmt.free()
    }
    return ids
  }

  getTagIdByName(name: string): number | undefined {
    const n = normalizeTagName(name)
    if (!n) return undefined
    const stmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL')
    stmt.bind([n])
    let id: number | undefined
    if (stmt.step()) {
      id = stmt.get()[0] as number
    }
    stmt.free()
    return id
  }

  /** Supabase row sync (main process only). */
  getSyncBridge(): SqliteSyncBridge {
    return new SqliteSyncBridge(this.db)
  }
}
