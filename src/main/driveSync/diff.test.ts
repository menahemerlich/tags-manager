import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { computeDiff } from './diff'
import type { ScanEntry } from '../../shared/driveSyncTypes'

function makeEntry(relativePath: string, size: number, isFile = true): ScanEntry {
  return { relativePath, size, mtimeMs: 0, isFile }
}

describe('computeDiff (fast mode)', () => {
  it('returns three buckets without doing IO', async () => {
    const a: ScanEntry[] = [
      makeEntry('only-a.txt', 10),
      makeEntry('shared.txt', 100),
      makeEntry('different-size.txt', 5),
      makeEntry('folder', 0, false)
    ]
    const b: ScanEntry[] = [
      makeEntry('only-b.txt', 20),
      makeEntry('shared.txt', 100),
      makeEntry('different-size.txt', 7),
      makeEntry('folder', 0, false)
    ]
    const r = await computeDiff(a, b, {
      mode: 'fast',
      rootA: '/no/such/path',
      rootB: '/no/such/path'
    })
    expect(r.onlyInA.map((e) => e.relativePath)).toEqual(['only-a.txt'])
    expect(r.onlyInB.map((e) => e.relativePath)).toEqual(['only-b.txt'])
    expect(r.differ.map((d) => d.relativePath)).toEqual(['different-size.txt'])
    expect(r.differ[0].reason).toBe('size')
  })

  it('does not place identical files into differ', async () => {
    const a: ScanEntry[] = [makeEntry('a.txt', 1)]
    const b: ScanEntry[] = [makeEntry('a.txt', 1)]
    const r = await computeDiff(a, b, {
      mode: 'fast',
      rootA: '/a',
      rootB: '/b'
    })
    expect(r.onlyInA).toEqual([])
    expect(r.onlyInB).toEqual([])
    expect(r.differ).toEqual([])
  })

  it('treats matching directories as not differing', async () => {
    const a: ScanEntry[] = [makeEntry('dir', 0, false)]
    const b: ScanEntry[] = [makeEntry('dir', 0, false)]
    const r = await computeDiff(a, b, { mode: 'fast', rootA: '/', rootB: '/' })
    expect(r.differ).toEqual([])
  })
})

describe('computeDiff (accurate mode)', () => {
  it('hashes only same-size pairs and detects different content', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'drive-sync-'))
    const aDir = path.join(tmp, 'a')
    const bDir = path.join(tmp, 'b')
    mkdirSync(aDir)
    mkdirSync(bDir)

    // Same name, same size, same content → should NOT be in differ
    writeFileSync(path.join(aDir, 'same.bin'), 'hello-same-content')
    writeFileSync(path.join(bDir, 'same.bin'), 'hello-same-content')
    // Same name, same size, different content → should be in differ with reason 'hash'
    writeFileSync(path.join(aDir, 'diff.bin'), 'AAAAAAAAA')
    writeFileSync(path.join(bDir, 'diff.bin'), 'BBBBBBBBB')

    const a: ScanEntry[] = [
      makeEntry('same.bin', 18),
      makeEntry('diff.bin', 9)
    ]
    const b: ScanEntry[] = [
      makeEntry('same.bin', 18),
      makeEntry('diff.bin', 9)
    ]

    try {
      const r = await computeDiff(a, b, {
        mode: 'accurate',
        rootA: aDir,
        rootB: bDir
      })
      expect(r.differ.map((d) => d.relativePath)).toEqual(['diff.bin'])
      expect(r.differ[0].reason).toBe('hash')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
