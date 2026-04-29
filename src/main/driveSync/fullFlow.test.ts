import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { scanFolder } from './scanner'
import { computeDiff } from './diff'
import { copyFolder, copyOne, resolveCopyPaths } from './copy'
import { normalizePath } from '../../shared/pathUtils'
import type { ScanEntry } from '../../shared/driveSyncTypes'

/**
 * End-to-end sanity check: scan two real folders, run computeDiff on the collected entries,
 * and verify the buckets match the deletions/additions made between them. This catches issues
 * that only surface when scanner output flows into computeDiff (paths, separators, ordering).
 */
describe('drive-sync full flow (scan + diff)', () => {
  it('detects deletions when one folder is a copy with files removed', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'drive-sync-flow-'))
    const aRoot = path.join(base, 'a')
    const bRoot = path.join(base, 'b')
    mkdirSync(aRoot)
    mkdirSync(bRoot)
    // Build folder A with a few files in nested dirs
    mkdirSync(path.join(aRoot, 'photos'))
    mkdirSync(path.join(aRoot, 'photos', '2025'))
    writeFileSync(path.join(aRoot, 'photos', 'a.jpg'), 'AAA')
    writeFileSync(path.join(aRoot, 'photos', 'b.jpg'), 'BBB')
    writeFileSync(path.join(aRoot, 'photos', '2025', 'c.jpg'), 'CCC')
    writeFileSync(path.join(aRoot, 'readme.txt'), 'hello')

    // B is a copy where one file and one nested file are deleted
    mkdirSync(path.join(bRoot, 'photos'))
    mkdirSync(path.join(bRoot, 'photos', '2025'))
    writeFileSync(path.join(bRoot, 'photos', 'a.jpg'), 'AAA') // identical
    // b.jpg deleted in B
    // 2025/c.jpg deleted in B
    writeFileSync(path.join(bRoot, 'readme.txt'), 'hello-edited') // different size

    try {
      const entriesA: ScanEntry[] = []
      const entriesB: ScanEntry[] = []
      await scanFolder(aRoot, { onEntry: (e) => entriesA.push(e) })
      await scanFolder(bRoot, { onEntry: (e) => entriesB.push(e) })

      // Sanity: scanner saw the right files
      const namesA = entriesA.map((e) => e.relativePath).sort()
      const namesB = entriesB.map((e) => e.relativePath).sort()
      expect(namesA).toContain('photos/b.jpg')
      expect(namesA).toContain('photos/2025/c.jpg')
      expect(namesB).not.toContain('photos/b.jpg')
      expect(namesB).not.toContain('photos/2025/c.jpg')

      const diff = await computeDiff(entriesA, entriesB, {
        mode: 'fast',
        rootA: aRoot,
        rootB: bRoot
      })
      const onlyA = diff.onlyInA.map((e) => e.relativePath).sort()
      const onlyB = diff.onlyInB.map((e) => e.relativePath).sort()
      const differ = diff.differ.map((d) => d.relativePath).sort()

      expect(onlyA).toEqual(['photos/2025/c.jpg', 'photos/b.jpg'])
      expect(onlyB).toEqual([])
      expect(differ).toEqual(['readme.txt'])
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('handles Hebrew folder and file names end-to-end (scan → diff → copy)', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'drive-sync-heb-'))
    const aRoot = path.join(base, 'מקור')
    const bRoot = path.join(base, 'יעד')
    mkdirSync(aRoot)
    mkdirSync(bRoot)
    mkdirSync(path.join(aRoot, 'תיקיית_משנה'))
    writeFileSync(path.join(aRoot, 'תיקיית_משנה', 'קובץ א.txt'), 'תוכן ראשון')
    writeFileSync(path.join(aRoot, 'קובץ ב.txt'), 'תוכן שני')

    try {
      const entriesA: ScanEntry[] = []
      const entriesB: ScanEntry[] = []
      await scanFolder(aRoot, { onEntry: (e) => entriesA.push(e) })
      await scanFolder(bRoot, { onEntry: (e) => entriesB.push(e) })

      const rels = entriesA.map((e) => e.relativePath)
      expect(new Set(rels)).toEqual(
        new Set(['תיקיית_משנה', 'תיקיית_משנה/קובץ א.txt', 'קובץ ב.txt'])
      )

      const diff = await computeDiff(entriesA, entriesB, {
        mode: 'fast',
        rootA: aRoot,
        rootB: bRoot
      })
      // Everything in A is "only in A" (B is empty other than its root).
      expect(new Set(diff.onlyInA.map((e) => e.relativePath))).toEqual(
        new Set(['תיקיית_משנה', 'תיקיית_משנה/קובץ א.txt', 'קובץ ב.txt'])
      )
      expect(diff.onlyInB).toEqual([])

      // Verify the relative path round-trips back to a real source path that statSync can find.
      // This is the path the copy stage would compute for each selected job.
      const ctx = {
        rootA: normalizePath(aRoot),
        rootB: normalizePath(bRoot)
      }
      for (const e of entriesA) {
        const { sourceAbs } = resolveCopyPaths(ctx, {
          from: 'A',
          relativePath: e.relativePath,
          isDirectory: !e.isFile
        })
        expect(existsSync(sourceAbs), `source path should exist on disk: ${sourceAbs}`).toBe(true)
      }

      // Recursive folder copy of `תיקיית_משנה` → should mirror the inner file.
      const subSrc = path.join(aRoot, 'תיקיית_משנה')
      const subDest = path.join(bRoot, 'תיקיית_משנה')
      const r = await copyFolder(subSrc, subDest)
      expect(r.failed).toBe(0)
      expect(r.copied).toBeGreaterThan(0)
      expect(existsSync(path.join(subDest, 'קובץ א.txt'))).toBe(true)
      expect(readFileSync(path.join(subDest, 'קובץ א.txt'), 'utf8')).toBe('תוכן ראשון')

      // Single file copy with Hebrew name.
      await copyOne(
        path.join(aRoot, 'קובץ ב.txt'),
        path.join(bRoot, 'קובץ ב.txt'),
        'overwrite'
      )
      expect(readFileSync(path.join(bRoot, 'קובץ ב.txt'), 'utf8')).toBe('תוכן שני')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('detects renames as both onlyInA and onlyInB even when sizes are equal', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'drive-sync-flow-'))
    const aRoot = path.join(base, 'a')
    const bRoot = path.join(base, 'b')
    mkdirSync(aRoot)
    mkdirSync(bRoot)
    writeFileSync(path.join(aRoot, 'old-name.txt'), 'XYZ')
    writeFileSync(path.join(bRoot, 'new-name.txt'), 'XYZ')

    try {
      const entriesA: ScanEntry[] = []
      const entriesB: ScanEntry[] = []
      await scanFolder(aRoot, { onEntry: (e) => entriesA.push(e) })
      await scanFolder(bRoot, { onEntry: (e) => entriesB.push(e) })
      const diff = await computeDiff(entriesA, entriesB, {
        mode: 'fast',
        rootA: aRoot,
        rootB: bRoot
      })
      expect(diff.onlyInA.map((e) => e.relativePath)).toEqual(['old-name.txt'])
      expect(diff.onlyInB.map((e) => e.relativePath)).toEqual(['new-name.txt'])
      expect(diff.differ).toEqual([])
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
