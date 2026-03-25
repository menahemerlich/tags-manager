import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { App } from 'electron'
import { randomUUID } from 'node:crypto'
import type { TagDatabase } from '../../database'
import { loadSettings, saveSettings } from '../../settingsStore'
import type { AppSettings } from '../../../shared/types'
import type {
  ConflictRecord,
  SyncProgressPayload,
  SyncCheckResult,
  SyncSummary,
  SyncTableResult
} from '../../../shared/types/sync.types'
import type { SyncTableName } from '../../schema/syncMigration'
import {
  addPendingConflicts,
  readPendingConflicts,
  removeConflictsById,
  writePendingConflicts
} from './conflictStore'
import { appendSyncErrorLog } from './syncErrorLog'
import { randomConflictId, serializeRowForSupabase } from './sqliteSyncBridge'
import type { ISyncService } from './ISyncService'

export const SYNC_PUSH_ORDER: SyncTableName[] = [
  'tags',
  'paths',
  'tag_folders',
  'face_people',
  'path_tags',
  'path_tag_exclusions',
  'tag_folder_tags',
  'face_embeddings',
  'person_profiles'
]

function ts(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return ''
}

function normalizeRemoteRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString()
    } else if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Uint8Array)) {
      out[k] = v
    } else {
      out[k] = v
    }
  }
  return out
}

function recordKeyFor(table: SyncTableName, row: Record<string, unknown>): string {
  const u = String(row.uuid ?? '')
  return `${table}:${u}`
}

function formatSupabaseErrorDetail(error: unknown): string {
  const asAny = error as any
  const msg =
    typeof asAny?.message === 'string'
      ? asAny.message
      : typeof asAny?.error_description === 'string'
        ? asAny.error_description
        : ''

  const raw = msg || safeStringify(error) || String(error)
  const lower = raw.toLowerCase()

  // Cloudflare / gateway / HTML error pages
  if (lower.includes('<!doctype html') || lower.includes('bad gateway') || lower.includes('error code 502')) {
    const ray =
      raw.match(/Cloudflare Ray ID:\s*<strong[^>]*>([^<]+)<\/strong>/i)?.[1] ??
      raw.match(/Cloudflare Ray ID:\s*([0-9a-f]+)/i)?.[1]
    return `Supabase/Cloudflare החזירו 502 (Bad Gateway). זו בדרך כלל תקלה זמנית בצד השרת או פרויקט לא זמין. נסו שוב בעוד דקה-שתיים.${
      ray ? ` (Ray ID: ${ray})` : ''
    }`
  }

  // Avoid returning huge payloads to UI/logs
  return raw.length > 500 ? raw.slice(0, 500) + '…' : raw
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

export class SyncService implements ISyncService {
  constructor(
    private readonly app: App,
    private readonly getDb: () => TagDatabase
  ) {}

  private userDataDir(): string {
    return this.app.getPath('userData')
  }

  private log(msg: string): void {
    appendSyncErrorLog(this.userDataDir(), msg)
  }

  private client(): SupabaseClient | null {
    const s = loadSettings(this.app)
    const url = s.sync?.supabaseUrl?.trim()
    const key = s.sync?.supabaseAnonKey?.trim()
    if (!url || !key) return null
    return createClient(url, key)
  }

  private ensureDeviceId(settings: AppSettings): AppSettings {
    const id = settings.sync?.syncDeviceId?.trim()
    if (id) return settings
    const next: AppSettings = {
      ...settings,
      sync: { ...settings.sync, syncDeviceId: randomUUID() }
    }
    saveSettings(this.app, next)
    return next
  }

  async getStatus(): Promise<{
    lastPushAt?: string
    lastPullAt?: string
    pendingConflicts: number
    deviceId?: string
  }> {
    const s = loadSettings(this.app)
    const pending = readPendingConflicts(this.userDataDir()).length
    return {
      lastPushAt: s.sync?.lastSupabasePushAt,
      lastPullAt: s.sync?.lastSupabasePullAt,
      pendingConflicts: pending,
      deviceId: s.sync?.syncDeviceId
    }
  }

  async readMigrationSql(): Promise<{ ok: boolean; sql?: string; error?: string }> {
    const candidates = [
      join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql'),
      join(this.app.getAppPath(), '..', '..', 'supabase', 'migrations', '001_initial_schema.sql'),
      join(this.app.getAppPath(), 'supabase', 'migrations', '001_initial_schema.sql'),
      join(this.app.getAppPath(), '..', 'supabase', 'migrations', '001_initial_schema.sql')
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          return { ok: true, sql: readFileSync(p, 'utf-8') }
        } catch (e) {
          return { ok: false, error: (e as Error).message }
        }
      }
    }
    return { ok: false, error: 'קובץ המיגרציה לא נמצא (supabase/migrations/001_initial_schema.sql)' }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const c = this.client()
    if (!c) return { ok: false, error: 'חסרים Supabase URL או מפתח anon' }
    const { error } = await c.from('tags').select('uuid').limit(1)
    if (error) {
      const errDetail = formatSupabaseErrorDetail(error)
      this.log(`testConnection: ${errDetail}`)
      return { ok: false, error: errDetail }
    }
    return { ok: true }
  }

  async check(): Promise<SyncCheckResult> {
    const client = this.client()
    if (!client) {
      return { ok: false, upToDate: true, totalPending: 0, perTable: [], error: 'חסרים Supabase URL או מפתח' }
    }
    let s = loadSettings(this.app)
    s = this.ensureDeviceId(s)
    const lastPush = s.sync?.lastSupabasePushAt ?? null
    const lastPull = s.sync?.lastSupabasePullAt ?? null
    const bridge = this.getDb().getSyncBridge()
    const perTable: { table: string; count: number }[] = []
    let total = 0
    for (const table of SYNC_PUSH_ORDER) {
      const local = bridge.countPendingPush(table, lastPush)
      let remote = 0
      let q = client.from(table).select('*', { count: 'exact', head: true })
      if (lastPull && lastPull.length > 0) {
        q = q.gt('updated_at', lastPull) as typeof q
      }
      const { count, error } = await q
      if (error) {
        this.log(`check remote ${table}: ${error.message}`)
        return {
          ok: false,
          upToDate: false,
          totalPending: 0,
          perTable: [],
          error: `טבלה "${table}": ${error.message}`
        }
      }
      remote = count ?? 0
      const sum = local + remote
      if (sum > 0) {
        perTable.push({ table, count: sum })
        total += sum
      }
    }
    return {
      ok: true,
      upToDate: total === 0,
      totalPending: total,
      perTable
    }
  }

  async push(onProgress?: (p: SyncProgressPayload) => void): Promise<SyncSummary> {
    const client = this.client()
    if (!client) {
      return {
        ok: false,
        message: 'חסרים Supabase URL או מפתח',
        tables: []
      }
    }
    let s = loadSettings(this.app)
    s = this.ensureDeviceId(s)
    const lastPushGlobal = s.sync?.lastSupabasePushAt ?? null
    const perTable = s.sync?.lastSupabasePushAtByTable ?? {}
    const bridge = this.getDb().getSyncBridge()
    const tables: SyncTableResult[] = []
    // One logical push run id. We use this as the watermark for per-table completion.
    const runStamp = new Date().toISOString()
    const totalsByTable = new Map<string, number>()
    let overallTotal = 0
    for (const table of SYNC_PUSH_ORDER) {
      const since = perTable[table] ?? lastPushGlobal
      const c = bridge.countPendingPush(table, since)
      totalsByTable.set(table, c)
      overallTotal += c
    }
    let overallDone = 0
    onProgress?.({
      operation: 'push',
      stage: 'start',
      overallDone,
      overallTotal,
      message: overallTotal === 0 ? 'אין רשומות לדחיפה.' : 'מתחיל דחיפה לענן...'
    })
    try {
      for (const table of SYNC_PUSH_ORDER) {
        const since = perTable[table] ?? lastPushGlobal
        const rows = bridge.exportForPush(table, since)
        const tableTotal = totalsByTable.get(table) ?? rows.length
        let tableDone = 0
        onProgress?.({
          operation: 'push',
          stage: 'table',
          table,
          tableDone,
          tableTotal,
          overallDone,
          overallTotal,
          message: `דחיפה: ${table}`
        })
        if (rows.length === 0) {
          tables.push({ table, pushed: 0 })
          // Mark this table as completed for this run (so retries won't re-scan it).
          const current = loadSettings(this.app)
          saveSettings(this.app, {
            ...current,
            sync: {
              ...current.sync,
              lastSupabasePushAtByTable: { ...(current.sync?.lastSupabasePushAtByTable ?? {}), [table]: runStamp }
            }
          })
          continue
        }
        const payload = rows
          .map((r) => serializeRowForSupabase(table, r))
          .filter((r) => typeof r.uuid === 'string' && (r.uuid as string).length > 0)
        const chunkSize = 80
        let pushed = 0
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize)
          const { error } = await client.from(table).upsert(chunk, { onConflict: 'uuid' })
          if (error) {
            const errDetail = formatSupabaseErrorDetail(error)
            this.log(`push ${table}: ${errDetail}`)
            tables.push({ table, pushed, error: errDetail })
            onProgress?.({
              operation: 'push',
              stage: 'error',
              table,
              tableDone,
              tableTotal,
              overallDone,
              overallTotal,
              message: errDetail
            })
            return { ok: false, message: errDetail, tables }
          }
          pushed += chunk.length
          tableDone = pushed
          overallDone += chunk.length
          onProgress?.({
            operation: 'push',
            stage: 'progress',
            table,
            tableDone,
            tableTotal,
            overallDone,
            overallTotal
          })
        }
        tables.push({ table, pushed })
        // Persist checkpoint: this table completed successfully.
        const current = loadSettings(this.app)
        saveSettings(this.app, {
          ...current,
          sync: {
            ...current.sync,
            lastSupabasePushAtByTable: { ...(current.sync?.lastSupabasePushAtByTable ?? {}), [table]: runStamp }
          }
        })
      }
      const next: AppSettings = {
        ...s,
        sync: { ...s.sync, lastSupabasePushAt: runStamp, lastSupabasePushAtByTable: undefined }
      }
      saveSettings(this.app, next)
      onProgress?.({
        operation: 'push',
        stage: 'done',
        overallDone: overallTotal,
        overallTotal,
        message: 'הדחיפה הסתיימה.'
      })
      return { ok: true, tables, lastOperationAt: runStamp }
    } catch (e) {
      const msg = (e as Error).message || String(e)
      this.log(`push: ${msg}`)
      onProgress?.({ operation: 'push', stage: 'error', overallDone, overallTotal, message: msg })
      return { ok: false, message: msg, tables }
    }
  }

  async pull(onProgress?: (p: SyncProgressPayload) => void): Promise<SyncSummary> {
    const client = this.client()
    if (!client) {
      return { ok: false, message: 'חסרים Supabase URL או מפתח', tables: [] }
    }
    let s = loadSettings(this.app)
    s = this.ensureDeviceId(s)
    const lastPullAt = s.sync?.lastSupabasePullAt ?? null
    const bridge = this.getDb().getSyncBridge()
    const db = this.getDb()
    const tables: SyncTableResult[] = []
    const conflicts: ConflictRecord[] = []
    const now = new Date().toISOString()
    const totalsByTable = new Map<string, number>()
    let overallTotal = 0
    for (const table of SYNC_PUSH_ORDER) {
      let q = client.from(table).select('*', { count: 'exact', head: true })
      if (lastPullAt && lastPullAt.length > 0) {
        q = q.gt('updated_at', lastPullAt) as typeof q
      }
      const { count, error } = await q
      if (error) {
        this.log(`pull count ${table}: ${error.message}`)
        onProgress?.({ operation: 'pull', stage: 'error', message: error.message })
        return { ok: false, message: error.message, tables }
      }
      const c = count ?? 0
      totalsByTable.set(table, c)
      overallTotal += c
    }
    let overallDone = 0
    onProgress?.({
      operation: 'pull',
      stage: 'start',
      overallDone,
      overallTotal,
      message: overallTotal === 0 ? 'אין עדכונים למשיכה.' : 'מתחיל משיכה מהענן...'
    })
    try {
      for (const table of SYNC_PUSH_ORDER) {
        let pulled = 0
        let skipped = 0
        let conflictCount = 0
        const pageSize = 400
        let offset = 0
        const tableTotal = totalsByTable.get(table) ?? 0
        let tableDone = 0
        onProgress?.({
          operation: 'pull',
          stage: 'table',
          table,
          tableDone,
          tableTotal,
          overallDone,
          overallTotal,
          message: `משיכה: ${table}`
        })
        db.beginBulkMode()
        try {
          while (true) {
            let q = client.from(table).select('*').order('updated_at', { ascending: true })
            if (lastPullAt && lastPullAt.length > 0) {
              q = q.gt('updated_at', lastPullAt) as typeof q
            }
            const { data, error } = await q.range(offset, offset + pageSize - 1)
            if (error) {
              const errDetail = formatSupabaseErrorDetail(error)
              this.log(`pull ${table}: ${errDetail}`)
              tables.push({ table, pulled, error: errDetail })
              onProgress?.({
                operation: 'pull',
                stage: 'error',
                table,
                tableDone,
                tableTotal,
                overallDone,
                overallTotal,
                message: errDetail
              })
              return { ok: false, message: errDetail, tables }
            }
            const batch = (data ?? []) as Record<string, unknown>[]
            if (batch.length === 0) break

            for (const raw of batch) {
              const remote = normalizeRemoteRow(raw) as Record<string, unknown>
              const uuid = String(remote.uuid ?? '')
              if (!uuid) {
                skipped += 1
                continue
              }
              const local = bridge.getRowByUuid(table, uuid)
              const remoteTs = ts(remote.updated_at)
              const localTs = local ? ts(local.updated_at) : ''
              if (local && localTs === remoteTs) {
                skipped += 1
                continue
              }
              const isConflict =
                !!local &&
                !!lastPullAt &&
                localTs > lastPullAt &&
                remoteTs > lastPullAt &&
                localTs !== remoteTs
              if (isConflict) {
                conflictCount += 1
                conflicts.push({
                  id: randomConflictId(),
                  table,
                  recordKey: recordKeyFor(table, remote),
                  localRow: local as Record<string, unknown>,
                  cloudRow: remote,
                  localUpdatedAt: localTs,
                  cloudUpdatedAt: remoteTs
                })
                continue
              }
              if (!lastPullAt && local) {
                if (remoteTs > localTs) {
                  bridge.applyRemoteRow(table, remote)
                  pulled += 1
                } else {
                  skipped += 1
                }
                continue
              }
              if (!local) {
                bridge.applyRemoteRow(table, remote)
                pulled += 1
                continue
              }
              if (lastPullAt && localTs <= lastPullAt) {
                bridge.applyRemoteRow(table, remote)
                pulled += 1
                continue
              }
              if (remoteTs > localTs) {
                bridge.applyRemoteRow(table, remote)
                pulled += 1
              } else {
                skipped += 1
              }
            }
            tableDone += batch.length
            overallDone += batch.length
            onProgress?.({
              operation: 'pull',
              stage: 'progress',
              table,
              tableDone,
              tableTotal,
              overallDone,
              overallTotal
            })
            offset += batch.length
            if (batch.length < pageSize) break
          }
        } finally {
          db.endBulkMode()
        }
        tables.push({ table, pulled, skipped, conflicts: conflictCount })
      }
      if (conflicts.length > 0) {
        addPendingConflicts(this.userDataDir(), conflicts)
      }
      const next: AppSettings = {
        ...s,
        sync: { ...s.sync, lastSupabasePullAt: now }
      }
      saveSettings(this.app, next)
      onProgress?.({
        operation: 'pull',
        stage: 'done',
        overallDone: overallTotal,
        overallTotal,
        message: 'המשיכה הסתיימה.'
      })
      return { ok: true, tables, lastOperationAt: now }
    } catch (e) {
      const msg = (e as Error).message || String(e)
      this.log(`pull: ${msg}`)
      onProgress?.({ operation: 'pull', stage: 'error', overallDone: 0, overallTotal, message: msg })
      return { ok: false, message: msg, tables }
    }
  }

  async readConflicts(): Promise<{ conflicts: ConflictRecord[] }> {
    return { conflicts: readPendingConflicts(this.userDataDir()) }
  }

  async resolveConflicts(
    resolutions: { id: string; choice: 'keep-mine' | 'use-cloud' }[]
  ): Promise<{ ok: boolean; error?: string }> {
    const list = readPendingConflicts(this.userDataDir())
    const byId = new Map(list.map((c) => [c.id, c]))
    const remove = new Set<string>()
    const db = this.getDb()
    const bridge = db.getSyncBridge()
    try {
      db.beginBulkMode()
      for (const r of resolutions) {
        const c = byId.get(r.id)
        if (!c) continue
        remove.add(r.id)
        if (r.choice === 'use-cloud') {
          bridge.applyRemoteRow(c.table as SyncTableName, c.cloudRow)
        }
      }
      db.endBulkMode()
      removeConflictsById(this.userDataDir(), remove)
      return { ok: true }
    } catch (e) {
      const msg = (e as Error).message || String(e)
      this.log(`resolveConflicts: ${msg}`)
      try {
        db.endBulkMode()
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg }
    }
  }

  async resetSyncState(): Promise<{ ok: boolean; error?: string }> {
    try {
      const s = loadSettings(this.app)
      const next: AppSettings = {
        ...s,
        sync: {
          ...s.sync,
          lastSupabasePushAt: undefined,
          lastSupabasePushAtByTable: undefined,
          lastSupabasePullAt: undefined
        }
      }
      saveSettings(this.app, next)
      writePendingConflicts(this.userDataDir(), [])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}
