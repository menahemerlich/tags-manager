import { createReadStream, existsSync } from 'node:fs'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { protocol } from 'electron'
import type { App } from 'electron'
import { tryResolveMediaFsPath } from '../services/media/resolveMediaFsPath'

// Must be registered before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-resource',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

function contentTypeForExt(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  if (e === 'mp4') return 'video/mp4'
  if (e === 'webm') return 'video/webm'
  if (e === 'mov') return 'video/quicktime'
  if (e === 'mkv') return 'video/x-matroska'
  return 'application/octet-stream'
}

export function registerLocalResourceProtocol(app: App): void {
  // Stream protocol (supports Range) for large video playback.
  protocol.registerStreamProtocol('local-resource', (request, callback) => {
    try {
      const url = new URL(request.url)
      const kind = url.hostname // e.g. thumb / file
      let pathname: string
      try {
        pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      } catch {
        callback({ statusCode: 400 })
        return
      }

      if (kind === 'thumb') {
        const fp = join(app.getPath('userData'), 'cache', 'thumbnails', pathname)
        if (!existsSync(fp)) {
          callback({ statusCode: 404 })
          return
        }
        const ext = fp.split('.').pop() ?? ''
        callback({
          statusCode: 200,
          headers: { 'Content-Type': contentTypeForExt(ext) },
          data: createReadStream(fp)
        })
        return
      }

      if (kind === 'file') {
        // local-resource://file/<absolute-path>
        let fp = pathname
        try {
          fp = tryResolveMediaFsPath(pathname) ?? pathname
        } catch {
          fp = pathname
        }
        if (!existsSync(fp)) {
          callback({ statusCode: 404 })
          return
        }
        const stat = statSync(fp)
        const ext = fp.split('.').pop() ?? ''
        const range = request.headers?.Range ?? request.headers?.range

        if (range && typeof range === 'string') {
          const m = /bytes=(\d+)-(\d+)?/.exec(range)
          if (m) {
            const start = Number(m[1])
            const end = m[2] ? Number(m[2]) : stat.size - 1
            const safeEnd = Math.min(end, stat.size - 1)
            callback({
              statusCode: 206,
              headers: {
                'Content-Type': contentTypeForExt(ext),
                'Accept-Ranges': 'bytes',
                'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
                'Content-Length': String(safeEnd - start + 1)
              },
              data: createReadStream(fp, { start, end: safeEnd })
            })
            return
          }
        }

        callback({
          statusCode: 200,
          headers: {
            'Content-Type': contentTypeForExt(ext),
            'Content-Length': String(stat.size),
            'Accept-Ranges': 'bytes'
          },
          data: createReadStream(fp)
        })
        return
      }

      callback({ statusCode: 404 })
    } catch {
      callback({ statusCode: 500 })
    }
  })
}

