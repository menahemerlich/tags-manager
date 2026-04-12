import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { Jimp } from 'jimp'
import { locateMediaTools } from './services/media/ffmpegLocator'
import type { WatermarkRasterOverlayPayload, WatermarkTextOverlayPayload } from '../shared/types'

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

export interface WatermarkVideoExportOptions {
  baseVideoPath: string
  watermarkImagePath: string
  outputPath: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  startSec: number
  endSec: number
  textOverlay?: WatermarkTextOverlayPayload
  shapeOverlays?: WatermarkRasterOverlayPayload[]
  onProgress?: (info: { percent: number }) => void
}

function timemarkToSeconds(tm: string): number {
  const s = tm.trim()
  if (!s) return 0
  const parts = s.split(':')
  if (parts.length >= 3) {
    const h = parseFloat(parts[parts.length - 3] ?? '0') || 0
    const m = parseFloat(parts[parts.length - 2] ?? '0') || 0
    const sec = parseFloat(parts[parts.length - 1] ?? '0') || 0
    return h * 3600 + m * 60 + sec
  }
  if (parts.length === 2) {
    return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0)
  }
  return parseFloat(s) || 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export async function exportWatermarkedVideoSegment(app: App, opts: WatermarkVideoExportOptions): Promise<void> {
  const tools = locateMediaTools(app)
  if (!tools.ffmpeg) {
    throw new Error('FFmpeg not available')
  }
  ffmpeg.setFfmpegPath(tools.ffmpeg)

  const start = clamp(opts.startSec, 0, 1e9)
  const end = clamp(opts.endSec, start + 0.001, 1e9)
  if (!(end > start)) {
    throw new Error('Invalid time range')
  }
  const clipDurationSec = end - start

  const tw = Math.max(1, Math.round(opts.width))
  const th = Math.max(1, Math.round(opts.height))
  const op = clamp(opts.opacity, 0, 1)
  const xi = Math.round(opts.x)
  const yi = Math.round(opts.y)

  const wmSrc = opts.watermarkImagePath.startsWith('file://')
    ? fileURLToPath(opts.watermarkImagePath)
    : opts.watermarkImagePath
  const wm = await Jimp.read(wmSrc)
  const prepared = wm.clone().resize({ w: tw, h: th }).opacity(op)
  const tmpPng = join(tmpdir(), `tags-wm-v-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
  writeFileSync(tmpPng, await prepared.getBuffer('image/png'))

  const textOv = opts.textOverlay
  let tmpTextPng: string | null = null
  let textW = 0
  let textH = 0
  let txi = 0
  let tyi = 0
  if (
    textOv &&
    typeof textOv.dataUrl === 'string' &&
    textOv.dataUrl.startsWith('data:image/') &&
    typeof textOv.width === 'number' &&
    typeof textOv.height === 'number' &&
    textOv.width > 0 &&
    textOv.height > 0
  ) {
    try {
      const b64 = textOv.dataUrl.split(',')[1] ?? ''
      const textImg = await Jimp.read(Buffer.from(b64, 'base64'))
      textW = Math.max(1, Math.round(textOv.width))
      textH = Math.max(1, Math.round(textOv.height))
      const textPrepared = (
        textImg.bitmap.width === textW && textImg.bitmap.height === textH
          ? textImg.clone()
          : textImg.clone().resize({ w: textW, h: textH })
      ) as JimpImage
      tmpTextPng = join(tmpdir(), `tags-wm-txt-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
      writeFileSync(tmpTextPng, await textPrepared.getBuffer('image/png'))
      txi = Math.round(textOv.x)
      tyi = Math.round(textOv.y)
    } catch {
      tmpTextPng = null
    }
  }

  type PreparedShape = { path: string; w: number; h: number; x: number; y: number }
  const shapeTmpFiles: string[] = []
  const preparedShapes: PreparedShape[] = []
  for (const sh of opts.shapeOverlays ?? []) {
    if (
      !sh ||
      typeof sh.dataUrl !== 'string' ||
      !sh.dataUrl.startsWith('data:image/') ||
      typeof sh.width !== 'number' ||
      typeof sh.height !== 'number' ||
      sh.width <= 0 ||
      sh.height <= 0
    ) {
      continue
    }
    try {
      const b64 = sh.dataUrl.split(',')[1] ?? ''
      const img = await Jimp.read(Buffer.from(b64, 'base64'))
      const sw = Math.max(1, Math.round(sh.width))
      const shh = Math.max(1, Math.round(sh.height))
      const prep =
        img.bitmap.width === sw && img.bitmap.height === shh
          ? (img.clone() as JimpImage)
          : (img.clone().resize({ w: sw, h: shh }) as JimpImage)
      const p = join(tmpdir(), `tags-wm-shp-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
      writeFileSync(p, await prep.getBuffer('image/png'))
      shapeTmpFiles.push(p)
      preparedShapes.push({
        path: p,
        w: sw,
        h: shh,
        x: Math.round(sh.x),
        y: Math.round(sh.y)
      })
    } catch {
      // skip bad shape
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const chain = ffmpeg(opts.baseVideoPath).inputOptions(['-ss', String(start), '-to', String(end)]).input(tmpPng)
      if (tmpTextPng) chain.input(tmpTextPng)
      for (const s of preparedShapes) {
        chain.input(s.path)
      }

      const parts: string[] = []
      let stream = '0:v'
      let inputIdx = 1

      parts.push(`[${inputIdx}:v]scale=${tw}:${th}[wm]`)
      parts.push(`[${stream}][wm]overlay=${xi}:${yi}:format=auto[wmout]`)
      stream = 'wmout'
      inputIdx += 1

      if (tmpTextPng) {
        parts.push(`[${inputIdx}:v]scale=${textW}:${textH}[tx]`)
        parts.push(`[${stream}][tx]overlay=${txi}:${tyi}:format=auto[txout]`)
        stream = 'txout'
        inputIdx += 1
      }

      preparedShapes.forEach((s, i) => {
        const last = i === preparedShapes.length - 1
        parts.push(`[${inputIdx}:v]scale=${s.w}:${s.h}[sh${i}]`)
        parts.push(`[${stream}][sh${i}]overlay=${s.x}:${s.y}:format=auto[${last ? 'outv' : `sh${i}out`}]`)
        stream = last ? 'outv' : `sh${i}out`
        inputIdx += 1
      })

      if (!tmpTextPng && preparedShapes.length === 0) {
        parts[parts.length - 1] = parts[parts.length - 1].replace('[wmout]', '[outv]')
      } else if (tmpTextPng && preparedShapes.length === 0) {
        parts[parts.length - 1] = parts[parts.length - 1].replace('[txout]', '[outv]')
      }

      const filter = parts.join(';')
      chain
        .complexFilter(filter)
        .outputOptions([
          '-map',
          '[outv]',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart'
        ])
        .on('progress', (p: { percent?: string | number; timemark?: string }) => {
          if (!opts.onProgress) return
          let pct = 0
          const rawPct = p.percent
          if (typeof rawPct === 'number' && Number.isFinite(rawPct)) {
            pct = rawPct
          } else if (typeof rawPct === 'string') {
            const n = parseFloat(rawPct.replace(/%/g, ''))
            if (Number.isFinite(n)) pct = n
          }
          if (!(pct > 0) && p.timemark && clipDurationSec > 0) {
            const t = timemarkToSeconds(String(p.timemark))
            pct = Math.min(99, Math.max(0, (t / clipDurationSec) * 100))
          }
          opts.onProgress({ percent: Math.min(100, Math.max(0, pct)) })
        })
        .on('end', () => {
          opts.onProgress?.({ percent: 100 })
          resolve()
        })
        .on('error', (err: Error) => reject(err))
        .save(opts.outputPath)
    })
  } finally {
    try {
      unlinkSync(tmpPng)
    } catch {
      // ignore
    }
    if (tmpTextPng) {
      try {
        unlinkSync(tmpTextPng)
      } catch {
        // ignore
      }
    }
    for (const p of shapeTmpFiles) {
      try {
        unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
}

export function defaultWatermarkedVideoPath(baseVideoPath: string): string {
  const parsed = path.parse(baseVideoPath)
  return path.join(parsed.dir, `${parsed.name}-watermarked.mp4`)
}

/** חיתוך קטע וידאו לקובץ זמני (לעריכה אחרי שמירה). */
export async function trimVideoSegmentToTempFile(app: App, inputPath: string, startSec: number, endSec: number): Promise<string> {
  const tools = locateMediaTools(app)
  if (!tools.ffmpeg) {
    throw new Error('FFmpeg not available')
  }
  ffmpeg.setFfmpegPath(tools.ffmpeg)

  const start = clamp(startSec, 0, 1e9)
  const end = clamp(endSec, start + 0.001, 1e9)
  const dur = end - start
  const outPath = join(tmpdir(), `tags-wm-trim-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`)

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .duration(dur)
      .outputOptions([
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
        '-map',
        '0:a?',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-avoid_negative_ts',
        'make_zero'
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(outPath)
  })

  return outPath
}
