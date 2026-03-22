import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from 'electron'
import type { AppSettings } from '../shared/types'

const defaultSettings: AppSettings = {
  githubRepo: ''
}

export function loadSettings(app: App): AppSettings {
  const fp = join(app.getPath('userData'), 'settings.json')
  if (!existsSync(fp)) return { ...defaultSettings }
  try {
    const raw = readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      githubRepo: typeof parsed.githubRepo === 'string' ? parsed.githubRepo : defaultSettings.githubRepo
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(app: App, s: AppSettings): void {
  const fp = join(app.getPath('userData'), 'settings.json')
  writeFileSync(fp, JSON.stringify(s, null, 2), 'utf-8')
}
