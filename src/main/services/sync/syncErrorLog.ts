import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LINES = 500

export function appendSyncErrorLog(userDataDir: string, message: string): void {
  const fp = join(userDataDir, 'sync-errors.log')
  const ts = new Date().toISOString()
  appendFileSync(fp, `[${ts}] ${message}\n`, 'utf-8')
  trimSyncErrorLog(fp)
}

function trimSyncErrorLog(fp: string): void {
  if (!existsSync(fp)) return
  const raw = readFileSync(fp, 'utf-8')
  const lines = raw.split('\n')
  if (lines.length <= MAX_LINES + 1) return
  const tail = lines.slice(-(MAX_LINES + 1)).filter((l, i, a) => i < a.length - 1 || l.length > 0)
  writeFileSync(fp, tail.join('\n') + (tail.length ? '\n' : ''), 'utf-8')
}
