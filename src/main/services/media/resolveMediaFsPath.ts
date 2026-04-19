import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizePath,
  pathDrivelessKey,
  sanitizePathInput,
  windowsAbsoluteFromDriveLetter
} from '../../../shared/pathUtils'

function collectPathVariants(s: string): string[] {
  const out: string[] = []
  const add = (v: string) => {
    if (!v) return
    const n = path.normalize(v)
    if (!out.includes(n)) out.push(n)
  }

  add(normalizePath(s))
  add(path.normalize(s))
  add(s)
  // Forward slashes only (common from exports / cloud sync on Windows)
  if (process.platform === 'win32' && /[\\/]/.test(s)) {
    add(s.replace(/\//g, '\\'))
  }

  if (process.platform === 'win32') {
    const main = normalizePath(s)
    if (!main.startsWith('\\\\?\\')) {
      if (main.startsWith('\\\\')) {
        add('\\\\?\\UNC\\' + main.slice(2))
      } else if (/^[A-Za-z]:/.test(main)) {
        add('\\\\?\\' + main.replace(/\//g, '\\'))
      }
    }
  }

  return out
}

function unicodePathBases(s: string): string[] {
  const out: string[] = []
  const add = (v: string) => {
    const t = v.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  add(s)
  const nfd = s.normalize('NFD')
  if (nfd !== s) add(nfd)
  return out
}

/**
 * Normalize user/renderer paths so `existsSync` matches real files on disk
 * (Windows long paths, Unicode, optional file://, quotes).
 */
/** USB / רשת: לפעמים הכונן מתעורר אחרי כשל ראשון ב־existsSync */
export async function tryResolveMediaFsPathWithRetry(
  raw: unknown,
  opts?: { attempts?: number; delayMs?: number }
): Promise<string | null> {
  const attempts = Math.max(1, opts?.attempts ?? 4)
  const delayMs = Math.max(0, opts?.delayMs ?? 125)
  for (let i = 0; i < attempts; i++) {
    const hit = tryResolveMediaFsPath(raw)
    if (hit) return hit
    if (i + 1 < attempts) await new Promise<void>((r) => setTimeout(r, delayMs))
  }
  return null
}

export function tryResolveMediaFsPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^file:\/\//i.test(trimmed)) {
    try {
      return tryResolveMediaFsPath(fileURLToPath(trimmed))
    } catch {
      return null
    }
  }

  let s = sanitizePathInput(trimmed)
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = sanitizePathInput(s.slice(1, -1))
  }
  if (!s) return null

  for (const base of unicodePathBases(s)) {
    for (const p of collectPathVariants(base)) {
      try {
        if (existsSync(p)) return p
      } catch {
        continue
      }
    }
  }

  for (const base of unicodePathBases(s)) {
    const norm = normalizePath(base)
    try {
      const rp = realpathSync.native(norm)
      if (existsSync(rp)) return rp
    } catch {
      continue
    }
  }

  return null
}

/**
 * כמו tryResolveMediaFsPath, ובנוסף ב־Windows: אם אין קובץ באות כונן שבנתיב אבל יש באותו זנב בכונן אחר — מחזיר אותו.
 */
export function resolvePathPreferExistingOnAnyDrive(storedPath: string): string {
  const quick = tryResolveMediaFsPath(storedPath)
  if (quick) return quick
  const norm = normalizePath(storedPath)
  if (process.platform !== 'win32') return norm
  try {
    if (existsSync(norm)) return norm
  } catch {
    /* ignore */
  }
  const dl = pathDrivelessKey(norm)
  if (!dl) return norm
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i)
    const candidate = windowsAbsoluteFromDriveLetter(L, dl)
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      continue
    }
  }
  return norm
}

export function resolveMediaFsPath(raw: unknown): string {
  const hit = tryResolveMediaFsPath(raw)
  if (hit) return hit
  throw new Error('File not found')
}

export async function resolveMediaFsPathAsync(raw: unknown): Promise<string> {
  const hit = await tryResolveMediaFsPathWithRetry(raw)
  if (hit) return hit
  // Same last resort as shell:open-path — tryResolve can miss edge cases Shell still accepts
  if (typeof raw === 'string') {
    const s = sanitizePathInput(raw.trim())
    if (s) {
      const n = normalizePath(s)
      try {
        if (existsSync(n)) return n
      } catch {
        // ignore
      }
    }
  }
  throw new Error('File not found')
}

export async function explainMediaPathDiagnostics(raw: unknown): Promise<{
  receivedLength: number
  leadingCodePoints: { cp: number; char: string }[]
  sanitized: string
  normalizedLikeOpenButton: string
  resolvedExistingPath: string | null
}> {
  if (typeof raw !== 'string') {
    return {
      receivedLength: 0,
      leadingCodePoints: [],
      sanitized: '',
      normalizedLikeOpenButton: '',
      resolvedExistingPath: null
    }
  }
  const sanitized = sanitizePathInput(raw.trim())
  const normalizedLikeOpenButton = sanitized ? normalizePath(sanitized) : ''
  return {
    receivedLength: raw.length,
    leadingCodePoints: [...raw].slice(0, 16).map((char) => ({
      char,
      cp: char.codePointAt(0) ?? 0
    })),
    sanitized,
    normalizedLikeOpenButton,
    resolvedExistingPath: await tryResolveMediaFsPathWithRetry(raw)
  }
}
