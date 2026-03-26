import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { Jimp } from 'jimp'
import { locateMediaTools } from './services/media/ffmpegLocator'
import type { WatermarkTextOverlayPayload } from '../shared/types'

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
      const textPrepared = textImg.clone().resize({ w: textW, h: textH })
      tmpTextPng = join(tmpdir(), `tags-wm-txt-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
      writeFileSync(tmpTextPng, await textPrepared.getBuffer('image/png'))
      txi = Math.round(textOv.x)
      tyi = Math.round(textOv.y)
    } catch {
      tmpTextPng = null
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const chain = ffmpeg(opts.baseVideoPath).inputOptions(['-ss', String(start), '-to', String(end)]).input(tmpPng)
      let filter: string
      if (tmpTextPng) {
        chain.input(tmpTextPng)
        filter = `[1:v]scale=${tw}:${th}[wm];[0:v][wm]overlay=${xi}:${yi}:format=auto[v1];[2:v]scale=${textW}:${textH}[tx];[v1][tx]overlay=${txi}:${tyi}:format=auto[outv]`
      } else {
        filter = `[1:v]scale=${tw}:${th}[wm];[0:v][wm]overlay=${xi}:${yi}:format=auto[outv]`
      }
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
  }
}

export function defaultWatermarkedVideoPath(baseVideoPath: string): string {
  const parsed = path.parse(baseVideoPath)
  return path.join(parsed.dir, `${parsed.name}-watermarked.mp4`)
}
