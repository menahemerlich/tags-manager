import { describe, expect, it } from 'vitest'
import { isValidTagName, normalizeTagName } from './tagNormalize'

describe('normalizeTagName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeTagName('  a   b  ')).toBe('a b')
  })
})

describe('isValidTagName', () => {
  it('rejects empty', () => {
    expect(isValidTagName('   ')).toBe(false)
  })
})
