import { describe, expect, it } from 'vitest'
import { analyzeHebrewDateAndHolidays } from './hebrewDate'

describe('analyzeHebrewDateAndHolidays', () => {
  it('does not throw on missing file', async () => {
    const res = await analyzeHebrewDateAndHolidays('Z:\\definitely_missing_file_12345.jpg')
    expect(res).toBeTruthy()
    expect(res.hebrewDate).toBe(null)
    expect(Array.isArray(res.holidays)).toBe(true)
  })
})

