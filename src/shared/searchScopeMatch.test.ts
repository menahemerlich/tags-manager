import { describe, expect, it } from 'vitest'
import { normalizePath } from './pathUtilsSearchClient'
import { pathMatchesSearchScope } from './searchScopeMatch'

describe.runIf(process.platform === 'win32')('pathMatchesSearchScope (Windows)', () => {
  it('rejects row when scope drive letter differs from row path drive', () => {
    const rowPath = normalizePath('D:\\Lib\\a\\b.txt')
    expect(pathMatchesSearchScope(rowPath, 'F:\\Lib', '\\lib\\a\\b.txt')).toBe(false)
  })

  it('accepts when scope and row share the same drive letter (driveless under scope)', () => {
    const rowPath = normalizePath('F:\\Lib\\a\\b.txt')
    expect(pathMatchesSearchScope(rowPath, 'F:\\Lib', '\\lib\\a\\b.txt')).toBe(true)
  })

  it('whole-drive scope only includes paths on that drive letter', () => {
    const rowPath = normalizePath('D:\\photos\\x.png')
    expect(pathMatchesSearchScope(rowPath, 'E:\\', '\\photos\\x.png')).toBe(false)
  })

  it('whole-drive scope matches files on the scoped drive', () => {
    const rowPath = normalizePath('E:\\photos\\x.png')
    expect(pathMatchesSearchScope(rowPath, 'E:\\', '\\photos\\x.png')).toBe(true)
  })
})
