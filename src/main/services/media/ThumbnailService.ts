import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { App } from 'electron'
import ffmpeg, { type FfprobeData } from 'fluent-ffmpeg'
import { Jimp } from 'jimp'
import { locateMediaTools } from './ffmpegLocator'
import { FfmpegQueue } from './ffmpegQueue'

const THUMB_MAX_W = 320
const THUMB_MAX_H = 240
const FAIL_TTL_MS = 10 * 60 * 1000

function normalizeExt(p: string): string {
  const idx = p.lastIndexOf('.')
  return idx >= 0 ? p.slice(idx + 1).toLowerCase() : ''
}

function isVideoExt(ext: string): boolean {
  return ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(ext)
}

function isImageExt(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext)
}

export class ThumbnailService {
  private readonly ffmpegQueue = new FfmpegQueue(3)
  private readonly cacheDir: string

  constructor(private readonly app: App) {
    this.cacheDir = join(this.app.getPath('userData'), 'cache', 'thumbnails')
    mkdirSync(this.cacheDir, { recursive: true })

    const tools = locateMediaTools(this.app)
    if (tools.ffmpeg) ffmpeg.setFfmpegPath(tools.ffmpeg)
    if (tools.ffprobe) ffmpeg.setFfprobePath(tools.ffprobe)
  }

  getThumbnailUrl(filePath: string): { url: string; cachePath: string } {
    const st = statSync(filePath)
    const keyRaw = `${filePath}::${st.size}::${st.mtimeMs}`
    const key = createHash('sha256').update(keyRaw).digest('hex').slice(0, 32)
    const outPath = join(this.cacheDir, `${key}.jpg`)
    const url = `local-resource://thumb/${key}.jpg`
    return { url, cachePath: outPath }
  }

  async ensureThumbnail(filePath: string, forceRetry = false): Promise<{ url: string }> {
    if (!existsSync(filePath)) {
      throw new Error('File not found')
    }

    const ext = normalizeExt(filePath)
    if (!isImageExt(ext) && !isVideoExt(ext)) {
      throw new Error('Unsupported media type')
    }

    const { url, cachePath } = this.getThumbnailUrl(filePath)
    const failMarker = `${cachePath}.fail.json`
    if (existsSync(cachePath)) return { url }

    if (forceRetry && existsSync(failMarker)) {
      try {
        unlinkSync(failMarker)
      } catch {
        // ignore
      }
    }

    if (existsSync(failMarker)) {
      const st = statSync(failMarker)
      if (Date.now() - st.mtimeMs < FAIL_TTL_MS) {
        throw new Error('Thumbnail generation recently failed (retry later).')
      }
    }

    try {
      if (isImageExt(ext)) {
        await this.generateImageThumb(filePath, cachePath)
        return { url }
      }

      await this.ffmpegQueue.enqueue(() => this.generateVideoThumb(filePath, cachePath))
      return { url }
    } catch (e) {
      writeFileSync(
        failMarker,
        JSON.stringify({ at: new Date().toISOString(), message: (e as Error)?.message ?? String(e) }, null, 2),
        'utf8'
      )

      const m = ((e as Error)?.message ?? String(e)).toLowerCase()
      const looksLikeMissingBinary =
        m.includes('enoent') ||
        (m.includes('spawn') && m.includes('not found')) ||
        m.includes('cannot find') ||
        m.includes('was not found') ||
        m.includes('is not recognized as an internal or external command')
      if ((m.includes('ffmpeg') || m.includes('ffprobe')) && looksLikeMissingBinary) {
        throw new Error('FFmpeg not available. Install ffmpeg or bundle it with the app.')
      }
      throw e
    }
  }

  private async generateImageThumb(filePath: string, outJpgPath: string): Promise<void> {
    const img = await Jimp.read(filePath)
    const w = img.bitmap.width
    const h = img.bitmap.height
    const scale = Math.min(THUMB_MAX_W / w, THUMB_MAX_H / h, 1)
    const nw = Math.max(1, Math.round(w * scale))
    const nh = Math.max(1, Math.round(h * scale))
    const scaled = nw === w && nh === h ? img : img.clone().resize({ w: nw, h: nh })
    /** תמונה לפלט JPEG — cast מבוקר כדי לעקוף איחוד טיפוסים של `getBuffer` בגרסת Jimp הנוכחית. */
    const jpegSource = scaled as unknown as { getBuffer: (mime: 'image/jpeg', opts?: { quality?: number }) => Promise<Buffer> }
    const buf = await jpegSource.getBuffer('image/jpeg', { quality: 80 })
    await writeFile(outJpgPath, buf)
  }

  private async generateVideoThumb(filePath: string, outJpgPath: string): Promise<void> {
    // Extract one frame roughly from the middle. We do a fast approximation using ffprobe duration.
    const durationSec = await new Promise<number>((resolve) => {
      ffmpeg.ffprobe(filePath, (err: Error | null, meta: FfprobeData) => {
        if (err) return resolve(0)
        const d = Number(meta?.format?.duration ?? 0)
        resolve(Number.isFinite(d) ? d : 0)
      })
    })
    const seek = durationSec > 1 ? durationSec / 2 : 0

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .seekInput(seek)
        .frames(1)
        .outputOptions([
          `-vf`,
          `scale='min(${THUMB_MAX_W},iw)':'min(${THUMB_MAX_H},ih)':force_original_aspect_ratio=decrease`
        ])
        .output(outJpgPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run()
    })
  }
}

