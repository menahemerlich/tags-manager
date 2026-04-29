import path from 'node:path'
import type {
  DiffBuckets,
  DifferingPair,
  ScanEntry,
  ScanMode
} from '../../shared/driveSyncTypes'
import { computeFastFingerprint } from '../identity/fingerprint'

export interface ComputeDiffOptions {
  mode: ScanMode
  rootA: string
  rootB: string
  signal?: AbortSignal
  /** Called as accurate-mode hashing progresses, with `(done, total)`. */
  onHashProgress?: (done: number, total: number) => void
}

/**
 * Build the three-way diff between two scan results.
 *
 * Buckets:
 * - `onlyInA`: entries whose relative path doesn't exist on side B at all.
 * - `onlyInB`: entries whose relative path doesn't exist on side A at all.
 * - `differ`: entries that exist on both sides but with different content (size for fast mode;
 *   size or sample-hash for accurate mode). Directories never go into `differ`.
 *
 * Performance:
 * - Lookups are O(1) via Map keyed by relative path.
 * - In fast mode no I/O is performed during diff computation.
 * - In accurate mode we hash only files that already match by size — this is the only case
 *   where content might still differ. Files that differ by size are placed in `differ` without
 *   hashing (we already know they're different).
 */
export async function computeDiff(
  entriesA: ScanEntry[],
  entriesB: ScanEntry[],
  opts: ComputeDiffOptions
): Promise<DiffBuckets> {
  const mapA = new Map<string, ScanEntry>()
  for (const e of entriesA) mapA.set(e.relativePath, e)
  const mapB = new Map<string, ScanEntry>()
  for (const e of entriesB) mapB.set(e.relativePath, e)

  const onlyInA: ScanEntry[] = []
  const onlyInB: ScanEntry[] = []
  const differ: DifferingPair[] = []
  /** Pairs that match on size and need a hash check in accurate mode. */
  const hashCandidates: DifferingPair[] = []

  for (const a of entriesA) {
    if (opts.signal?.aborted) break
    const b = mapB.get(a.relativePath)
    if (!b) {
      onlyInA.push(a)
      continue
    }
    if (a.isFile !== b.isFile) {
      // Same name, one's a directory and the other's a file. Treat as differing files where
      // possible; otherwise put in onlyInA + onlyInB so the user can resolve manually.
      onlyInA.push(a)
      continue
    }
    if (!a.isFile) {
      // Directories that exist on both sides aren't "different"; their children are compared
      // independently by their own entries.
      continue
    }
    if (a.size !== b.size) {
      differ.push({ relativePath: a.relativePath, a, b, reason: 'size' })
      continue
    }
    if (opts.mode === 'accurate') {
      hashCandidates.push({ relativePath: a.relativePath, a, b, reason: 'hash' })
    }
  }

  for (const b of entriesB) {
    if (opts.signal?.aborted) break
    if (!mapA.has(b.relativePath)) onlyInB.push(b)
  }

  if (opts.mode === 'accurate' && hashCandidates.length > 0) {
    let done = 0
    opts.onHashProgress?.(done, hashCandidates.length)
    // Process sequentially to keep IO predictable; can be batched later if profiling shows benefit.
    for (const cand of hashCandidates) {
      if (opts.signal?.aborted) break
      const aPath = path.join(opts.rootA, cand.relativePath.split('/').join(path.sep))
      const bPath = path.join(opts.rootB, cand.relativePath.split('/').join(path.sep))
      try {
        const [aFp, bFp] = await Promise.all([
          computeFastFingerprint(aPath),
          computeFastFingerprint(bPath)
        ])
        if (aFp.fingerprint !== bFp.fingerprint) {
          differ.push(cand)
        }
      } catch {
        // If we can't read either side, mark as differing so the user can decide.
        differ.push(cand)
      }
      done += 1
      opts.onHashProgress?.(done, hashCandidates.length)
    }
  }

  // Stable ordering for predictable UI.
  const byPath = (x: { relativePath: string }, y: { relativePath: string }): number =>
    x.relativePath.localeCompare(y.relativePath)
  onlyInA.sort(byPath)
  onlyInB.sort(byPath)
  differ.sort(byPath)

  return { onlyInA, onlyInB, differ }
}
