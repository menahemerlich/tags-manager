import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'

export interface FfmpegToolPaths {
  ffmpeg: string | null
  ffprobe: string | null
}

/**
 * Binaries cannot execute from inside app.asar. electron-builder unpacks them to app.asar.unpacked.
 */
function fixAsarExecutablePath(p: string): string {
  if (!p) return p
  const norm = normalize(p)
  const needle = `${sep}app.asar${sep}`
  const idx = norm.indexOf(needle)
  if (idx < 0) return p
  const unpacked =
    norm.slice(0, idx) + `${sep}app.asar.unpacked${sep}` + norm.slice(idx + needle.length)
  const candidate = normalize(unpacked)
  return existsSync(candidate) ? candidate : p
}

function readBinaryFromInstalledPackage(packageName: string, projectRoot: string): string | null {
  const pkgJson = join(projectRoot, 'node_modules', packageName, 'package.json')
  if (!existsSync(pkgJson)) return null
  try {
    const req = createRequire(pkgJson)
    const m = req('.') as string | { path?: string }
    const raw = typeof m === 'string' ? m : m?.path
    if (typeof raw !== 'string') return null
    const fixed = fixAsarExecutablePath(raw)
    if (existsSync(fixed)) return fixed
    return existsSync(raw) ? raw : null
  } catch {
    return null
  }
}

function findInNodeModulesTree(packageName: string, startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 14; i++) {
    const hit = readBinaryFromInstalledPackage(packageName, dir)
    if (hit) return hit
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function resolveNpmStaticBinary(packageName: string, app: App): string | null {
  const mainFileDir = dirname(fileURLToPath(import.meta.url))

  const fromMain = findInNodeModulesTree(packageName, mainFileDir)
  if (fromMain) return fromMain

  const fromCwd = findInNodeModulesTree(packageName, process.cwd())
  if (fromCwd) return fromCwd

  if (app.isPackaged) {
    const unpackedRoot = join(dirname(app.getAppPath()), 'app.asar.unpacked')
    const fromUnpacked = findInNodeModulesTree(packageName, unpackedRoot)
    if (fromUnpacked) return fromUnpacked
  }

  try {
    const req = createRequire(fileURLToPath(import.meta.url))
    const m = req(packageName) as string | { path?: string }
    const raw = typeof m === 'string' ? m : m?.path
    if (typeof raw === 'string') {
      const fixed = fixAsarExecutablePath(raw)
      if (existsSync(fixed)) return fixed
      if (existsSync(raw)) return raw
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Prefer user-bundled ffmpeg under resources, then npm `ffmpeg-static` / `ffprobe-static`,
 * then null (fluent-ffmpeg falls back to PATH).
 */
export function locateMediaTools(app: App): FfmpegToolPaths {
  const isWin = process.platform === 'win32'
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeName = isWin ? 'ffprobe.exe' : 'ffprobe'

  const bundledFfmpegCandidates = [
    join(process.resourcesPath, 'ffmpeg', process.platform, ffmpegName),
    join(app.getAppPath(), '..', '..', 'resources', 'ffmpeg', process.platform, ffmpegName),
    join(app.getAppPath(), 'resources', 'ffmpeg', process.platform, ffmpegName)
  ]

  for (const ffmpegPath of bundledFfmpegCandidates) {
    if (!existsSync(ffmpegPath)) continue
    const probePath = join(dirname(ffmpegPath), ffprobeName)
    const npmProbe = resolveNpmStaticBinary('ffprobe-static', app)
    return {
      ffmpeg: ffmpegPath,
      ffprobe: existsSync(probePath) ? probePath : npmProbe
    }
  }

  return {
    ffmpeg: resolveNpmStaticBinary('ffmpeg-static', app),
    ffprobe: resolveNpmStaticBinary('ffprobe-static', app)
  }
}
