import fs from 'node:fs/promises'
import path from 'node:path'
import { exiftool } from 'exiftool-vendored'
import hebcalPkg from 'hebcal'

const { HDate } = hebcalPkg as unknown as { HDate: new (d: Date) => any }

export interface HebrewDateAnalysis {
  /** ISO date used for conversion (best-effort). */
  sourceDateIso: string | null
  /** Hebrew formatted string e.g. כ"א באדר תשפ"ד */
  hebrewDate: string | null
  /** Holiday/event names (English per hebcal) */
  holidays: string[]
  /** Why we chose this date (EXIF vs fs). */
  reason: string
}

export interface HebrewDateOptions {
  /** Per-file timeout for the EXIF read step. On timeout we fall back to fs dates. */
  exifTimeoutMs?: number
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'])
const DEFAULT_EXIF_TIMEOUT_MS = 1500

function isImage(fp: string): boolean {
  return IMAGE_EXTS.has(path.extname(fp).toLowerCase())
}

function isVideo(fp: string): boolean {
  return VIDEO_EXTS.has(path.extname(fp).toLowerCase())
}

function isMedia(fp: string): boolean {
  return isImage(fp) || isVideo(fp)
}

function asDate(d: unknown): Date | null {
  if (!d) return null
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d
  if (typeof d === 'string') {
    const parsed = new Date(d)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (typeof d === 'object' && d !== null) {
    const anyD = d as { toDate?: () => Date; rawValue?: unknown }
    if (typeof anyD.toDate === 'function') {
      try {
        const r = anyD.toDate()
        if (r instanceof Date && !Number.isNaN(r.getTime())) return r
      } catch {
        // ignore
      }
    }
    if (anyD.rawValue) {
      const r = asDate(anyD.rawValue)
      if (r) return r
    }
  }
  return null
}

function withRaceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  if (!ms || ms <= 0) return p.then((v) => v ?? null).catch(() => null)
  return new Promise<T | null>((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve(null)
    }, ms)
    p.then(
      (v) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

/**
 * Try to extract the *capture* date from EXIF / video metadata.
 * Order matters: prefer fields most likely to reflect when the user actually shot the photo/video.
 */
async function tryExifDateTimeOriginal(filePath: string, timeoutMs: number): Promise<Date | null> {
  if (!isMedia(filePath)) return null
  const tags = await withRaceTimeout(exiftool.read(filePath) as Promise<any>, timeoutMs)
  if (!tags) return null
  return (
    asDate(tags?.SubSecDateTimeOriginal) ??
    asDate(tags?.DateTimeOriginal) ??
    asDate(tags?.SubSecCreateDate) ??
    asDate(tags?.CreateDate) ??
    asDate(tags?.MediaCreateDate) ??
    asDate(tags?.TrackCreateDate) ??
    asDate(tags?.GPSDateTime) ??
    asDate(tags?.DateTimeDigitized) ??
    asDate(tags?.ModifyDate) ??
    null
  )
}

async function tryFsDates(filePath: string): Promise<Date | null> {
  try {
    const st = await fs.stat(filePath)
    const birth = asDate(st.birthtime)
    const mtime = asDate(st.mtime)
    return birth ?? mtime
  } catch {
    return null
  }
}

function uniq(arr: string[]): string[] {
  const s = new Set<string>()
  for (const a of arr) if (a) s.add(a)
  return Array.from(s)
}

/**
 * Hebrew months by number, for non-leap years (12 = Adar).
 * In leap years, month 12 = Adar I, month 13 = Adar II — handled in code.
 */
const HEBREW_MONTHS_BY_NUMBER_NONLEAP: Record<number, string> = {
  1: 'ניסן',
  2: 'אייר',
  3: 'סיוון',
  4: 'תמוז',
  5: 'אב',
  6: 'אלול',
  7: 'תשרי',
  8: 'חשוון',
  9: 'כסלו',
  10: 'טבת',
  11: 'שבט',
  12: 'אדר'
}

const HEBREW_MONTHS_BY_NUMBER_LEAP: Record<number, string> = {
  ...HEBREW_MONTHS_BY_NUMBER_NONLEAP,
  12: 'אדר א׳',
  13: 'אדר ב׳'
}

const HEBREW_MONTHS_BY_ENGLISH: Record<string, string> = {
  Nisan: 'ניסן',
  Iyyar: 'אייר',
  Iyar: 'אייר',
  Sivan: 'סיוון',
  Tamuz: 'תמוז',
  Tammuz: 'תמוז',
  Av: 'אב',
  Elul: 'אלול',
  Tishrei: 'תשרי',
  Cheshvan: 'חשוון',
  Heshvan: 'חשוון',
  Kislev: 'כסלו',
  Tevet: 'טבת',
  "Sh'vat": 'שבט',
  Shvat: 'שבט',
  Adar: 'אדר',
  'Adar I': 'אדר א׳',
  'Adar II': 'אדר ב׳',
  // hebcal v2 actually returns "Adar 1" / "Adar 2" with a space — most common form.
  'Adar 1': 'אדר א׳',
  'Adar 2': 'אדר ב׳',
  Adar1: 'אדר א׳',
  Adar2: 'אדר ב׳'
}

const GEMATRIA_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']
const GEMATRIA_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const GEMATRIA_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']

function gematriaForNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n)
  let rest = Math.floor(n)
  let out = ''
  while (rest >= 1000) {
    out += GEMATRIA_ONES[Math.min(9, rest / 1000)] + "'"
    rest = rest % 1000
  }
  const h = Math.floor(rest / 100)
  rest = rest % 100
  out += GEMATRIA_HUNDREDS[h] ?? ''
  if (rest === 15) {
    out += 'טו'
  } else if (rest === 16) {
    out += 'טז'
  } else {
    const t = Math.floor(rest / 10)
    const o = rest % 10
    out += (GEMATRIA_TENS[t] ?? '') + (GEMATRIA_ONES[o] ?? '')
  }
  // Insert geresh/gershayim per convention (single letter -> ' ; multi -> ").
  const lettersOnly = out.replace(/'/g, '')
  if (lettersOnly.length === 1) return out + "'"
  if (lettersOnly.length >= 2 && !out.includes('"')) {
    return out.slice(0, -1) + '"' + out.slice(-1)
  }
  return out
}

/**
 * Direct dictionary translations. Keys are case-insensitive forms of `event.getDesc()`
 * after parenthetical suffixes are stripped (e.g. " (CH\"M)").
 * Pattern-based holidays (Pesach: N, Sukkot: N, etc.) are handled in `translateHolidayToHebrew`
 * and don't need entries here.
 */
const HEBREW_HOLIDAY_BY_EN: Record<string, string> = {
  // ראש השנה / יום כיפור / צום גדליה
  'erev rosh hashana': 'ערב ראש השנה',
  'tzom gedaliah': 'צום גדליה',
  'erev yom kippur': 'ערב יום כיפור',
  'yom kippur': 'יום כיפור',
  // סוכות / הושענא רבה / שמיני עצרת / שמחת תורה
  'erev sukkot': 'ערב סוכות',
  sukkot: 'סוכות',
  'shmini atzeret': 'שמיני עצרת',
  'simchat torah': 'שמחת תורה',
  'hoshana raba': 'הושענא רבה',
  // טו בשבט
  'tu bishvat': 'ט״ו בשבט',
  "tu b'shvat": 'ט״ו בשבט',
  // פורים / שושן פורים / תענית אסתר
  "ta'anit esther": 'תענית אסתר',
  'taanit esther': 'תענית אסתר',
  'erev purim': 'ערב פורים',
  purim: 'פורים',
  'shushan purim': 'שושן פורים',
  // פסח
  'erev pesach': 'ערב פסח',
  "ta'anit bechorot": 'תענית בכורות',
  'taanit bechorot': 'תענית בכורות',
  // ספירת העומר וימים מודרניים
  'start counting omer': 'תחילת ספירת העומר',
  'lag baomer': 'ל״ג בעומר',
  "lag b'omer": 'ל״ג בעומר',
  'yom hashoah': 'יום השואה',
  'yom hazikaron': 'יום הזיכרון',
  "yom ha'atzma'ut": 'יום העצמאות',
  'yom haatzmaut': 'יום העצמאות',
  'yom yerushalayim': 'יום ירושלים',
  'erev shavuot': 'ערב שבועות',
  // צומות
  'tzom tammuz': 'צום י״ז בתמוז',
  "shiva asar b'tammuz": 'שבעה עשר בתמוז',
  "erev tish'a b'av": 'ערב תשעה באב',
  "tish'a b'av": 'תשעה באב',
  "tisha b'av": 'תשעה באב',
  'tu beav': 'ט״ו באב',
  "tu b'av": 'ט״ו באב',
  "asara b'tevet": 'עשרה בטבת',
  'asara b’tevet': 'עשרה בטבת',
  // ראש חודש (numeric/month variants handled in translateHolidayToHebrew)
  'rosh chodesh': 'ראש חודש',
  // שבתות מיוחדות
  'shabbat mevarchim': 'שבת מברכים',
  'shabbat shuva': 'שבת שובה',
  'shabbat shekalim': 'שבת שקלים',
  'shabbat zachor': 'שבת זכור',
  'shabbat parah': 'שבת פרה',
  'shabbat hachodesh': 'שבת החודש',
  'shabbat hagadol': 'שבת הגדול',
  'shabbat chazon': 'שבת חזון',
  'shabbat nachamu': 'שבת נחמו',
  // חנוכה
  'erev chanukah': 'ערב חנוכה',
  chanukah: 'חנוכה',
  // misc
  'leil selichot': 'ליל סליחות'
}

const ORDINAL_DAY_HEBREW = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳']

/**
 * Translate a hebcal v2 holiday description string to Hebrew. Handles:
 * - Multi-day holidays in `Pesach: N`, `Sukkot: N`, `Pesach: N (CH"M)`, `Shavuot N`,
 *   `Rosh Hashana N`, `Sukkot: 7 (Hoshana Raba)` formats.
 * - Chanukah candle nights (`Chanukah: Candle N`) — with the 8th night labeled "זאת חנוכה".
 * - Rosh Chodesh — both month-name and 2-day numeric variants.
 * - Falls back to a static dictionary, then to the original string.
 */
export function translateHolidayToHebrew(en: string): string {
  if (!en) return en
  const trimmed = en.trim()
  const lower = trimmed.toLowerCase()

  // --- Multi-day holidays ---

  // "Sukkot: 7 (Hoshana Raba)" — explicit override before generic Sukkot match.
  if (/sukkot:\s*7\s*\(hoshana raba\)/i.test(trimmed)) return 'הושענא רבה'

  const sukkotMatch = lower.match(/^sukkot:?\s*(\d+)/)
  if (sukkotMatch) {
    const n = Number(sukkotMatch[1])
    if (/\(ch"?m\)/i.test(trimmed)) return 'חול המועד סוכות'
    if (n === 1) return 'סוכות'
    if (n === 2) return 'סוכות ב׳'
    return 'סוכות'
  }

  const pesachMatch = lower.match(/^pesach:?\s*(\d+)/)
  if (pesachMatch) {
    const n = Number(pesachMatch[1])
    if (/\(ch"?m\)/i.test(trimmed)) return 'חול המועד פסח'
    if (n === 1) return 'פסח'
    if (n === 2) return 'פסח ב׳'
    if (n === 7) return 'שביעי של פסח'
    if (n === 8) return 'אחרון של פסח'
    return 'פסח'
  }

  const shavuotMatch = lower.match(/^shavuot:?\s*(\d+)/)
  if (shavuotMatch) {
    const n = Number(shavuotMatch[1])
    if (n === 2) return 'שבועות ב׳'
    return 'שבועות'
  }

  const rhMatch = lower.match(/^rosh hashana\s*(\d+)/)
  if (rhMatch) {
    const n = Number(rhMatch[1])
    if (n === 2) return 'ראש השנה ב׳'
    return 'ראש השנה'
  }

  // "Chanukah: Candle N" / "Chanukah: N Candles" / "Chanukah: 8th day"
  const chanukahMatch = lower.match(/^chanukah:?\s*(?:candle\s*(\d+)|(\d+)\s*candles?|(\d+)(?:st|nd|rd|th)?\s*day)/)
  if (chanukahMatch) {
    const n = Number(chanukahMatch[1] ?? chanukahMatch[2] ?? chanukahMatch[3])
    if (n === 8) return 'זאת חנוכה'
    if (n >= 1 && n <= 8) return `חנוכה - יום ${ORDINAL_DAY_HEBREW[n] ?? n}`
    return 'חנוכה'
  }

  // "Rosh Chodesh <name|digit>"
  const roshChodeshMatch = trimmed.match(/^rosh chodesh\s+(.+)$/i)
  if (roshChodeshMatch) {
    const detail = roshChodeshMatch[1].trim()
    if (/^\d+$/.test(detail)) return 'ראש חודש'
    const monthHe = HEBREW_MONTHS_BY_ENGLISH[detail] ?? detail
    return `ראש חודש ${monthHe}`
  }

  // --- Direct dictionary lookup ---
  if (HEBREW_HOLIDAY_BY_EN[lower]) return HEBREW_HOLIDAY_BY_EN[lower]
  // Strip parenthetical suffix like " (CH\"M)" and try again.
  const stripped = lower.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (HEBREW_HOLIDAY_BY_EN[stripped]) return HEBREW_HOLIDAY_BY_EN[stripped]

  // Fallback: return as-is so the user still gets *something* (and we can spot it in logs).
  return trimmed
}

function looksHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s)
}

function getHebrewMonthName(hd: any): string | null {
  // 1) Number-first lookup is the most reliable across hebcal versions/languages.
  if (typeof hd.getMonth === 'function') {
    const monthNum = hd.getMonth()
    const isLeap = typeof hd.isLeapYear === 'function' ? hd.isLeapYear() : false
    const map = isLeap ? HEBREW_MONTHS_BY_NUMBER_LEAP : HEBREW_MONTHS_BY_NUMBER_NONLEAP
    const byNum = map[monthNum]
    if (byNum) return byNum
  }
  // 2) Fallback to English-name mapping (handles "Adar 1" / "Adar 2" etc.).
  if (typeof hd.getMonthName === 'function') {
    const en = String(hd.getMonthName())
    const mapped = HEBREW_MONTHS_BY_ENGLISH[en]
    if (mapped) return mapped
    // If hebcal happens to already return Hebrew, accept it.
    if (looksHebrew(en)) return en
  }
  return null
}

function formatHebrewDate(hd: any): string | null {
  try {
    const day = typeof hd.getDate === 'function' ? hd.getDate() : null
    const yearNum = typeof hd.getFullYear === 'function' ? hd.getFullYear() : null
    const monthName = getHebrewMonthName(hd)
    if (day == null || yearNum == null || !monthName) return null
    const dayHe = gematriaForNumber(day)
    // Year: drop the leading 5 (e.g. 5786 -> 786 = תשפ"ו), as is conventional in tags.
    const yearShort = yearNum > 5000 ? yearNum - 5000 : yearNum
    const yearHe = gematriaForNumber(yearShort)
    return `${dayHe} ב${monthName} ${yearHe}`
  } catch {
    return null
  }
}

/**
 * Apply the traditional Hebrew sunset rollover: if the photo time is after sunset,
 * advance the Hebrew date by one day.
 *
 * Without GPS data we approximate sunset using a sinusoidal model around 18:00 in Israel
 * (varies ±~1.5h between summer and winter). This avoids a heavy astronomy dependency and
 * is accurate enough for tagging.
 */
function approximateSunsetHourInIsrael(date: Date): number {
  // Day-of-year (1-366), local time.
  const start = new Date(date.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000) + 1
  // Peak around June 21 (day ~172) — sunset ~19:45; nadir around Dec 21 (day ~355) — sunset ~16:40.
  // amplitude ~1.5h, mean ~18:15 in Israel local time.
  const radians = ((dayOfYear - 81) / 365) * 2 * Math.PI
  const hours = 18.25 + 1.5 * Math.sin(radians)
  return hours
}

function applySunsetRollover(hd: any, date: Date): any {
  try {
    const sunsetHours = approximateSunsetHourInIsrael(date)
    const localHours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
    if (localHours >= sunsetHours && typeof hd.next === 'function') {
      return hd.next()
    }
    return hd
  } catch {
    return hd
  }
}

export async function analyzeHebrewDateAndHolidays(
  filePath: string,
  opts: HebrewDateOptions = {}
): Promise<HebrewDateAnalysis> {
  const exifTimeoutMs = opts.exifTimeoutMs ?? DEFAULT_EXIF_TIMEOUT_MS
  let chosen: Date | null = null
  let reason = 'no-date'
  try {
    const exifDate = await tryExifDateTimeOriginal(filePath, exifTimeoutMs)
    if (exifDate) {
      chosen = exifDate
      reason = 'EXIF:capture-time'
    }
  } catch {
    // ignore — fall through to fs
  }
  // For media files without EXIF/embedded metadata we deliberately DO NOT fall back to
  // filesystem dates — those usually reflect when the file was downloaded/copied, not when
  // the photo was actually taken. Showing today's Hebrew date for a 1995 photo is worse
  // than showing nothing.
  if (!chosen && !isMedia(filePath)) {
    try {
      const fsDate = await tryFsDates(filePath)
      if (fsDate) {
        chosen = fsDate
        reason = 'FS:birthtime/mtime'
      }
    } catch {
      // ignore
    }
  }

  if (!chosen) {
    return { sourceDateIso: null, hebrewDate: null, holidays: [], reason }
  }

  // Convert strictly by Gregorian calendar date — no sunset rollover. Most users want the
  // Hebrew date that corresponds to the visible Gregorian date of the photo, not the Halachic
  // post-sunset rollover (which would tag photos taken at night with the next day's Hebrew date).
  const hd = new HDate(chosen)
  const hebrewDate = formatHebrewDate(hd)
  // hebcal events: API surface differs between minor versions; we try both.
  let holidays: string[] = []
  try {
    const evs: any[] =
      (hd as any).getHolidays?.() ??
      (typeof (hd as any).holidays === 'function' ? (hd as any).holidays() : []) ??
      []
    const rawNames: string[] = evs
      .map((e) => {
        if (typeof e?.render === 'function') return e.render('en')
        if (typeof e?.getDesc === 'function') return e.getDesc()
        return e?.desc || e?.name || (typeof e === 'string' ? e : null)
      })
      .filter(Boolean)
    holidays = uniq(rawNames.map(translateHolidayToHebrew))
  } catch {
    holidays = []
  }

  return {
    sourceDateIso: chosen.toISOString(),
    hebrewDate,
    holidays,
    reason
  }
}

