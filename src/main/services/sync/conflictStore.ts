import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConflictRecord } from '../../../shared/types/sync.types'

const FILE = 'pending_conflicts.json'

export function readPendingConflicts(userDataDir: string): ConflictRecord[] {
  const fp = join(userDataDir, FILE)
  if (!existsSync(fp)) return []
  try {
    const raw = JSON.parse(readFileSync(fp, 'utf-8')) as { conflicts?: ConflictRecord[] }
    return Array.isArray(raw.conflicts) ? raw.conflicts : []
  } catch {
    return []
  }
}

export function writePendingConflicts(userDataDir: string, conflicts: ConflictRecord[]): void {
  const fp = join(userDataDir, FILE)
  writeFileSync(fp, JSON.stringify({ conflicts }, null, 2), 'utf-8')
}

export function addPendingConflicts(userDataDir: string, newOnes: ConflictRecord[]): void {
  const cur = readPendingConflicts(userDataDir)
  writePendingConflicts(userDataDir, [...cur, ...newOnes])
}

export function removeConflictsById(userDataDir: string, ids: Set<string>): void {
  const cur = readPendingConflicts(userDataDir)
  writePendingConflicts(
    userDataDir,
    cur.filter((c) => !ids.has(c.id))
  )
}
