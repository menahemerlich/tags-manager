import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { copyOne, makeKeepBothPath, resolveCopyPaths } from './copy'

function setup(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), 'copy-test-'))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

describe('resolveCopyPaths', () => {
  it('inverts source/destination based on the from side', () => {
    const r = resolveCopyPaths(
      { rootA: '/a', rootB: '/b' },
      { from: 'A', relativePath: 'sub/x.txt', isDirectory: false }
    )
    expect(r.sourceAbs.endsWith(path.join('a', 'sub', 'x.txt'))).toBe(true)
    expect(r.destAbs.endsWith(path.join('b', 'sub', 'x.txt'))).toBe(true)
    expect(r.destSide).toBe('B')
  })
})

describe('copyOne', () => {
  it('copies a file to a non-existent destination', async () => {
    const { root, cleanup } = setup()
    try {
      const src = path.join(root, 'src.txt')
      const dst = path.join(root, 'sub', 'dst.txt')
      writeFileSync(src, 'data-here')
      const r = await copyOne(src, dst, 'overwrite')
      expect(r.result).toBe('copied')
      expect(readFileSync(dst, 'utf8')).toBe('data-here')
    } finally {
      cleanup()
    }
  })

  it('skip leaves existing file untouched', async () => {
    const { root, cleanup } = setup()
    try {
      const src = path.join(root, 'src.txt')
      const dst = path.join(root, 'dst.txt')
      writeFileSync(src, 'NEW')
      writeFileSync(dst, 'OLD')
      const r = await copyOne(src, dst, 'skip')
      expect(r.result).toBe('skipped')
      expect(readFileSync(dst, 'utf8')).toBe('OLD')
    } finally {
      cleanup()
    }
  })

  it('overwrite replaces the existing file', async () => {
    const { root, cleanup } = setup()
    try {
      const src = path.join(root, 'src.txt')
      const dst = path.join(root, 'dst.txt')
      writeFileSync(src, 'NEW')
      writeFileSync(dst, 'OLD')
      const r = await copyOne(src, dst, 'overwrite')
      expect(r.result).toBe('copied')
      expect(readFileSync(dst, 'utf8')).toBe('NEW')
    } finally {
      cleanup()
    }
  })

  it('keep-both writes to a non-conflicting path next to the existing file', async () => {
    const { root, cleanup } = setup()
    try {
      const src = path.join(root, 'src.txt')
      const dst = path.join(root, 'dst.txt')
      writeFileSync(src, 'NEW')
      writeFileSync(dst, 'OLD')
      const r = await copyOne(src, dst, 'keep-both')
      expect(r.result).toBe('renamed')
      if (r.result !== 'renamed') return
      expect(r.finalDest).not.toBe(dst)
      expect(readFileSync(dst, 'utf8')).toBe('OLD')
      expect(readFileSync(r.finalDest, 'utf8')).toBe('NEW')
    } finally {
      cleanup()
    }
  })
})

describe('makeKeepBothPath', () => {
  it('appends an incrementing suffix before the extension', () => {
    const { root, cleanup } = setup()
    try {
      const a = path.join(root, 'x.txt')
      writeFileSync(a, '1')
      const b = makeKeepBothPath(a)
      expect(b).toBe(path.join(root, 'x (1).txt'))
      writeFileSync(b, '2')
      const c = makeKeepBothPath(a)
      expect(c).toBe(path.join(root, 'x (2).txt'))
      expect(existsSync(b)).toBe(true)
    } finally {
      cleanup()
    }
  })
})
