import { describe, expect, it } from 'vitest'
import { normalizePath } from './pathUtils'
import { pathMatchesSearchScope } from './searchScopeMatch'

describe.runIf(process.platform === 'win32')('pathMatchesSearchScope (Windows)', () => {
  it('matches same logical path when scope and row use different drive letters', () => {
    const rowPath = normalizePath('D:\\Lib\\a\\b.txt')
    expect(
      pathMatchesSearchScope(rowPath, 'F:\\Lib', '\\lib\\a\\b.txt')
    ).toBe(true)
  })

  it('whole-drive scope includes any path on drive via driveless keys', () => {
    const rowPath = normalizePath('D:\\photos\\x.png')
    expect(pathMatchesSearchScope(rowPath, 'E:\\', '\\photos\\x.png')).toBe(true)
  })
})
