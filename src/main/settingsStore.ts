import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from 'electron'
import type { AppSettings } from '../shared/types'

const defaultSettings: AppSettings = {
  githubRepo: '',
  sync: {}
}

function normalizeSyncSettings(input: unknown): AppSettings['sync'] {
  if (!input || typeof input !== 'object') return {}
  const sync = input as Record<string, unknown>
  const byTableRaw = (sync.lastSupabasePushAtByTable ?? null) as unknown
  const lastSupabasePushAtByTable =
    byTableRaw && typeof byTableRaw === 'object' && !Array.isArray(byTableRaw)
      ? Object.fromEntries(
          Object.entries(byTableRaw as Record<string, unknown>).filter(
            ([, v]) => typeof v === 'string' && (v as string).length > 0
          )
        )
      : undefined
  return {
    supabaseUrl: typeof sync.supabaseUrl === 'string' ? sync.supabaseUrl : undefined,
    supabaseAnonKey: typeof sync.supabaseAnonKey === 'string' ? sync.supabaseAnonKey : undefined,
    lastSupabasePushAt: typeof sync.lastSupabasePushAt === 'string' ? sync.lastSupabasePushAt : undefined,
    lastSupabasePushAtByTable,
    lastSupabasePullAt: typeof sync.lastSupabasePullAt === 'string' ? sync.lastSupabasePullAt : undefined,
    syncDeviceId: typeof sync.syncDeviceId === 'string' ? sync.syncDeviceId : undefined
  }
}

export function loadSettings(app: App): AppSettings {
  const fp = join(app.getPath('userData'), 'settings.json')
  if (!existsSync(fp)) return { ...defaultSettings }
  try {
    const raw = readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      githubRepo: typeof parsed.githubRepo === 'string' ? parsed.githubRepo : defaultSettings.githubRepo,
      sync: normalizeSyncSettings(parsed.sync)
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(app: App, s: AppSettings): void {
  const fp = join(app.getPath('userData'), 'settings.json')
  writeFileSync(fp, JSON.stringify(s, null, 2), 'utf-8')
}
