import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { PathKind } from '../../shared/types'
import { normalizePath } from '../../shared/pathUtils'

export interface SelectionItem {
  path: string
  kind: PathKind
}

export interface SamplePolicy {
  maxSamples: number
  maxCandidates: number
  /** Stop scanning after this many ms (best-effort). */
  scanTimeBudgetMs: number
}

const DEFAULT_POLICY: SamplePolicy = {
  maxSamples: 5,
  maxCandidates: 400,
  scanTimeBudgetMs: 1200
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff', '.gif', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'])

function isSupportedMediaFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)
}

function scoreCandidate(filePath: string): number {
  // Prefer media because EXIF/vision layers are more useful.
  if (isSupportedMediaFile(filePath)) return 100
  return 10
}

function seedFromSelection(selection: SelectionItem[]): number {
  const stable = selection
    .map((s) => `${normalizePath(s.path)}|${s.kind}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n')
  const h = crypto.createHash('sha256').update(stable).digest()
  return h.readUInt32LE(0)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function listFilesShallow(folderPath: string): Promise<string[]> {
  try {
    const ents = await fs.readdir(folderPath, { withFileTypes: true })
    return ents
      .filter((e) => e.isFile())
      .map((e) => normalizePath(path.join(folderPath, e.name)))
  } catch {
    return []
  }
}

async function walkFolderCollectCandidates(
  folderPath: string,
  pushCandidate: (fp: string) => void,
  shouldStop: () => boolean
): Promise<void> {
  const stack: string[] = [normalizePath(folderPath)]
  while (stack.length) {
    if (shouldStop()) return
    const dir = stack.pop()!
    let ents: import('node:fs').Dirent[] = []
    try {
      ents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of ents) {
      if (shouldStop()) return
      const full = normalizePath(path.join(dir, ent.name))
      if (ent.isDirectory()) {
        stack.push(full)
      } else if (ent.isFile()) {
        pushCandidate(full)
      }
    }
  }
}

/**
 * Sample up to 5 representative files from selection.
 * - For folders: traverses lazily and stops after enough candidates or time budget.
 * - Prefers media files, but will fall back to any files.
 */
export async function sampleRepresentativeFiles(
  selection: SelectionItem[],
  policy: Partial<SamplePolicy> = {}
): Promise<string[]> {
  const p: SamplePolicy = { ...DEFAULT_POLICY, ...policy }
  const candidates: { path: string; score: number }[] = []

  const t0 = Date.now()
  const shouldStop = () => candidates.length >= p.maxCandidates || Date.now() - t0 > p.scanTimeBudgetMs
  const pushCandidate = (fp: string) => {
    if (!fp) return
    candidates.push({ path: normalizePath(fp), score: scoreCandidate(fp) })
  }

  for (const item of selection) {
    if (shouldStop()) break
    const norm = normalizePath(item.path)
    if (item.kind === 'file') {
      pushCandidate(norm)
      continue
    }
    // Folder: try shallow first to quickly grab a few.
    const shallow = await listFilesShallow(norm)
    for (const f of shallow) {
      if (shouldStop()) break
      pushCandidate(f)
    }
    if (shouldStop()) break
    await walkFolderCollectCandidates(norm, pushCandidate, shouldStop)
  }

  const dedup = new Map<string, number>()
  for (const c of candidates) {
    const prev = dedup.get(c.path)
    dedup.set(c.path, prev == null ? c.score : Math.max(prev, c.score))
  }

  const all = Array.from(dedup.entries())
    .map(([fp, sc]) => ({ path: fp, score: sc }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.path.localeCompare(b.path)
    })

  if (!all.length) return []

  // Keep the set for representative pick: sort lexicographically for stable first/middle/last.
  const stable = [...all].sort((a, b) => a.path.localeCompare(b.path))
  const pick = new Map<string, true>()

  const first = stable[0]?.path
  const last = stable[stable.length - 1]?.path
  const mid = stable[Math.floor((stable.length - 1) / 2)]?.path
  if (first) pick.set(first, true)
  if (mid) pick.set(mid, true)
  if (last) pick.set(last, true)

  const seed = seedFromSelection(selection)
  const rand = mulberry32(seed)
  const pool = stable.map((s) => s.path).filter((fp) => !pick.has(fp))
  while (pick.size < p.maxSamples && pool.length) {
    const idx = Math.floor(rand() * pool.length)
    const chosen = pool.splice(idx, 1)[0]
    pick.set(chosen, true)
  }

  // Final: Prefer media inside the picked set, but keep representativeness.
  const picked = Array.from(pick.keys())
  const media = picked.filter(isSupportedMediaFile)
  const nonMedia = picked.filter((fp) => !isSupportedMediaFile(fp))
  return [...media, ...nonMedia].slice(0, p.maxSamples)
}

