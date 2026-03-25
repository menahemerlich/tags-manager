import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ancestorDirsOfFile, normalizePath, sanitizePathInput } from './pathUtils'

describe('sanitizePathInput', () => {
  it('removes RTL marks that would break path.resolve on Windows', () => {
    expect(sanitizePathInput('\u200EC:\\test\\file.png')).toBe('C:\\test\\file.png')
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
})

describe('ancestorDirsOfFile', () => {
  it('first ancestor is parent directory', () => {
    const file = path.join('C:', 'a', 'b', 'c', 'file.txt')
    const norm = normalizePath(file)
    const a = ancestorDirsOfFile(norm)
    expect(a[0]).toBe(path.dirname(norm))
  })
})
