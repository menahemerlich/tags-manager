import { describe, expect, it } from 'vitest'
import { analyzeHebrewDateAndHolidays, translateHolidayToHebrew } from './hebrewDate'

describe('analyzeHebrewDateAndHolidays', () => {
  it('does not throw on missing file', async () => {
    const res = await analyzeHebrewDateAndHolidays('Z:\\definitely_missing_file_12345.jpg')
    expect(res).toBeTruthy()
    expect(res.hebrewDate).toBe(null)
    expect(Array.isArray(res.holidays)).toBe(true)
  })
})

describe('translateHolidayToHebrew', () => {
  it.each([
    ['Erev Rosh Hashana', 'ערב ראש השנה'],
    ['Rosh Hashana 1', 'ראש השנה'],
    ['Rosh Hashana 2', 'ראש השנה ב׳'],
    ['Yom Kippur', 'יום כיפור'],
    ['Erev Sukkot', 'ערב סוכות'],
    ['Sukkot: 1', 'סוכות'],
    ['Sukkot: 2', 'סוכות ב׳'],
    ['Sukkot: 3 (CH"M)', 'חול המועד סוכות'],
    ['Sukkot: 5 (CH"M)', 'חול המועד סוכות'],
    ['Sukkot: 7 (Hoshana Raba)', 'הושענא רבה'],
    ['Shmini Atzeret', 'שמיני עצרת'],
    ['Simchat Torah', 'שמחת תורה'],
    ['Erev Chanukah', 'ערב חנוכה'],
    ['Chanukah: Candle 1', 'חנוכה - יום א׳'],
    ['Chanukah: Candle 7', 'חנוכה - יום ז׳'],
    ['Chanukah: Candle 8', 'זאת חנוכה'],
    ['Chanukah: 8 Candles', 'זאת חנוכה'],
    ['Chanukah: 8th day', 'זאת חנוכה'],
    ['Erev Pesach', 'ערב פסח'],
    ['Pesach: 1', 'פסח'],
    ['Pesach: 2', 'פסח ב׳'],
    ['Pesach: 3 (CH"M)', 'חול המועד פסח'],
    ['Pesach: 7', 'שביעי של פסח'],
    ['Pesach: 8', 'אחרון של פסח'],
    ['Erev Shavuot', 'ערב שבועות'],
    ['Shavuot 1', 'שבועות'],
    ['Shavuot 2', 'שבועות ב׳'],
    ['Rosh Chodesh Iyyar', 'ראש חודש אייר'],
    ['Rosh Chodesh 1', 'ראש חודש'],
    ['Rosh Chodesh 2', 'ראש חודש'],
    ['Shabbat HaGadol', 'שבת הגדול'],
    ['Shabbat Mevarchim', 'שבת מברכים'],
    ['Tu BiShvat', 'ט״ו בשבט'],
    ['Purim', 'פורים'],
    ['Shushan Purim', 'שושן פורים'],
    ['Lag BaOmer', 'ל״ג בעומר'],
    ['Yom HaShoah', 'יום השואה'],
    ['Yom HaZikaron', 'יום הזיכרון'],
    ["Yom Ha'atzma'ut", 'יום העצמאות'],
    ["Tish'a B'Av", 'תשעה באב']
  ])('translates %s to %s', (input, expected) => {
    expect(translateHolidayToHebrew(input)).toBe(expected)
  })
})

