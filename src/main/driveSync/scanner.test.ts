import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { scanFolder } from './scanner'
import type { ScanEntry } from '../../shared/driveSyncTypes'

function setupTree(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), 'scanner-test-'))
  mkdirSync(path.join(root, 'sub'))
  mkdirSync(path.join(root, 'sub', 'deep'))
  writeFileSync(path.join(root, 'a.txt'), 'AA')
  writeFileSync(path.join(root, 'sub', 'b.txt'), 'BBB')
  writeFileSync(path.join(root, 'sub', 'deep', 'c.txt'), 'CCCC')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

describe('scanFolder', () => {
  it('emits all files and directories with relative forward-slash paths', async () => {
    const { root, cleanup } = setupTree()
    try {
      const collected: ScanEntry[] = []
      const { scanned } = await scanFolder(root, { onEntry: (e) => collected.push(e) })
      const rels = collected.map((e) => e.relativePath).sort()
      expect(rels).toEqual([
        'a.txt',
        'sub',
        'sub/b.txt',
        'sub/deep',
        'sub/deep/c.txt'
      ])
      expect(scanned).toBe(5)
      const file = collected.find((e) => e.relativePath === 'a.txt')!
      expect(file.isFile).toBe(true)
      expect(file.size).toBe(2)
    } finally {
      cleanup()
    }
  })

  it('respects AbortSignal', async () => {
    const { root, cleanup } = setupTree()
    try {
      const ac = new AbortController()
      ac.abort()
      const collected: ScanEntry[] = []
      await scanFolder(root, { onEntry: (e) => collected.push(e), signal: ac.signal })
      expect(collected.length).toBe(0)
    } finally {
      cleanup()
    }
  })
})
