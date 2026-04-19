import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ancestorDirsOfFile,
  ancestorDrivelessDirs,
  drivelessItemUnderScope,
  normalizePath,
  normalizeSearchScopePath,
  pathDrivelessKey,
  pathDrivelessKeyNormalized,
  resolvePathForSearchScope,
  sanitizePathInput,
  windowsAbsoluteFromDriveLetter
} from './pathUtils'

describe('sanitizePathInput', () => {
  it('removes RTL marks that would break path.resolve on Windows', () => {
    expect(sanitizePathInput('\u200EC:\\test\\file.png')).toBe('C:\\test\\file.png')
  })
  it('removes zero-width space', () => {
    expect(sanitizePathInput('C:\\a\u200Bb')).toBe('C:\\ab')
  })
  it('removes BOM and normalizes NFC', () => {
    expect(sanitizePathInput('\uFEFF  /tmp/x  ')).toBe('/tmp/x')
  })
})

describe('normalizePath', () => {
  it('resolves relative segments', () => {
    const base = path.join('C:', 'tmp', 'x', 'y', '..', 'z')
    const n = normalizePath(base)
    expect(n).toContain('z')
  })
  it('applies sanitize before resolve (RLM before path)', () => {
    const n = normalizePath('\u200f/tmp/a/b')
    expect(n).toContain('tmp')
    expect(n).not.toContain('\u200f')
  })
})

describe('ancestorDirsOfFile', () => {
  it('first ancestor is parent directory', () => {
    const file = path.join('C:', 'a', 'b', 'c', 'file.txt')
    const norm = normalizePath(file)
    const a = ancestorDirsOfFile(norm)
    expect(a[0]).toBe(path.dirname(norm))
  })
})

describe('pathDrivelessKeyNormalized', () => {
  it('returns null for UNC-like paths', () => {
    expect(pathDrivelessKeyNormalized('\\\\server\\share\\a')).toBeNull()
  })
  it('returns lowercase tail with leading backslash for drive paths', () => {
    expect(pathDrivelessKeyNormalized('D:\\Lib\\A.jpg')).toBe('\\lib\\a.jpg')
    expect(pathDrivelessKeyNormalized('d:\\')).toBe('\\')
  })
})

describe('ancestorDrivelessDirs', () => {
  it('walks parents to drive root marker', () => {
    expect(ancestorDrivelessDirs('\\lib\\a\\b.txt')).toEqual(['\\lib\\a', '\\lib', '\\'])
  })
})

describe('drivelessItemUnderScope', () => {
  it('accepts exact match and children', () => {
    expect(drivelessItemUnderScope('\\lib\\a', '\\lib')).toBe(true)
    expect(drivelessItemUnderScope('\\lib', '\\lib')).toBe(true)
    expect(drivelessItemUnderScope('\\other', '\\lib')).toBe(false)
  })
  it('whole-drive scope', () => {
    expect(drivelessItemUnderScope('\\x', '\\')).toBe(true)
    expect(drivelessItemUnderScope('\\', '\\')).toBe(false)
  })
})

describe.runIf(process.platform === 'win32')('windowsAbsoluteFromDriveLetter', () => {
  it('builds drive root and nested paths', () => {
    expect(windowsAbsoluteFromDriveLetter('E', '\\')).toBe('E:\\')
    expect(windowsAbsoluteFromDriveLetter('e', '\\a\\b')).toBe('E:\\a\\b')
  })
})

describe.runIf(process.platform === 'win32')('normalizeSearchScopePath', () => {
  it('keeps drive root as X:\\ not bare X:', () => {
    expect(normalizeSearchScopePath('D:\\')).toMatch(/^D:\\$/i)
    expect(pathDrivelessKeyNormalized(normalizeSearchScopePath('D:\\'))).toBe('\\')
  })
})

describe.runIf(process.platform === 'win32')('pathDrivelessKey (Windows)', () => {
  it('matches normalized absolute paths', () => {
    const n = normalizePath('D:\\Photos\\X.png')
    expect(pathDrivelessKey(n)).toBe('\\photos\\x.png')
  })
})

describe.runIf(process.platform === 'win32')('resolvePathForSearchScope (Windows)', () => {
  it('rewrites stored path under current scope drive', () => {
    const resolved = resolvePathForSearchScope('F:\\Lib', 'D:\\Lib\\a\\b.txt', '\\lib\\a\\b.txt')
    expect(resolved.toLowerCase()).toBe('f:\\lib\\a\\b.txt')
  })
})
