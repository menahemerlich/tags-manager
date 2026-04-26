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

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff'])

function isImage(fp: string): boolean {
  return IMAGE_EXTS.has(path.extname(fp).toLowerCase())
}

function asDate(d: unknown): Date | null {
  if (!d) return null
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d
  if (typeof d === 'string') {
    const parsed = new Date(d)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

async function tryExifDateTimeOriginal(filePath: string): Promise<Date | null> {
  if (!isImage(filePath)) return null
  try {
    const tags: any = await exiftool.read(filePath)
    const dto = asDate(tags?.DateTimeOriginal) ?? asDate(tags?.CreateDate) ?? asDate(tags?.ModifyDate)
    return dto
  } catch {
    return null
  }
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

export async function analyzeHebrewDateAndHolidays(filePath: string): Promise<HebrewDateAnalysis> {
  const exifDate = await tryExifDateTimeOriginal(filePath)
  const fsDate = exifDate ? null : await tryFsDates(filePath)
  const chosen = exifDate ?? fsDate
  const reason = exifDate ? 'EXIF:DateTimeOriginal' : fsDate ? 'FS:birthtime/mtime' : 'no-date'

  if (!chosen) {
    return { sourceDateIso: null, hebrewDate: null, holidays: [], reason }
  }

  const hd = new HDate(chosen)
  const hebrewDate = hd.renderGematriya('he')
  // hebcal events: use an HDate method to get holidays; if none, return [].
  // NOTE: API surface differs between minor versions; we keep this defensive.
  let holidays: string[] = []
  try {
    const evs: any[] = (hd as any).getHolidays?.() ?? []
    holidays = uniq(
      evs
        .map((e) => (typeof e?.render === 'function' ? e.render('en') : e?.desc || e?.name || null))
        .filter(Boolean)
    )
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

