import { parentPort } from 'node:worker_threads'
import { exiftool } from 'exiftool-vendored'
import type { PathKind } from '../../shared/types'
import { sampleRepresentativeFiles, type SelectionItem } from '../smartSuggest/sampling'
import { analyzeHebrewDateAndHolidays } from '../smartSuggest/hebrewDate'
import { analyzeFilenameHeuristics } from '../smartSuggest/filenameHeuristics'
import { analyzeVision, warmVisionModel } from '../smartSuggest/vision/runVision'
import { withTimeout } from '../smartSuggest/time'

let exiftoolWarmed: Promise<void> | null = null
function warmExiftool(): Promise<void> {
  if (exiftoolWarmed) return exiftoolWarmed
  exiftoolWarmed = (async () => {
    try {
      await Promise.race([
        exiftool.version(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('exiftool warmup timeout')), 5000))
      ])
    } catch {
      // Best-effort warmup; if it fails, hebrewDate will fall back to fs dates.
    }
  })()
  return exiftoolWarmed
}

export interface SmartSuggestWorkerRequest {
  selectionItems: { path: string; kind: PathKind }[]
  policy?: { maxSamples?: number; maxCandidates?: number; scanTimeBudgetMs?: number }
  vision?: { enabled?: boolean; timeoutMs?: number }
}

export interface SmartSuggestSuggestion {
  tag: string
  score: number
  reasons: string[]
}

export interface SmartSuggestWorkerResponse {
  ok: true
  sampledFiles: string[]
  suggestions: SmartSuggestSuggestion[]
  elapsedMs: number
}

export interface SmartSuggestWorkerErrorResponse {
  ok: false
  error: string
  elapsedMs: number
}

function nowMs(): number {
  return Date.now()
}

function addSuggestion(
  map: Map<string, { score: number; reasons: Set<string> }>,
  tag: string,
  score: number,
  reason: string
) {
  const key = tag.trim()
  if (!key) return
  const prev = map.get(key)
  if (!prev) {
    map.set(key, { score, reasons: new Set([reason]) })
    return
  }
  prev.score = Math.max(prev.score, score)
  prev.reasons.add(reason)
}

parentPort?.on('message', async (req: SmartSuggestWorkerRequest) => {
  const t0 = nowMs()
  try {
    const selection: SelectionItem[] = (req.selectionItems ?? []).map((s) => ({ path: s.path, kind: s.kind }))
    if (!selection.length) {
      parentPort?.postMessage({ ok: true, sampledFiles: [], suggestions: [], elapsedMs: nowMs() - t0 } satisfies SmartSuggestWorkerResponse)
      return
    }

    const visionEnabled = req.vision?.enabled ?? true

    // Run sampling AND warmups in parallel so we don't pay these costs serially.
    // Vision model load (~hundreds of ms) and exiftool spawn (~1-3s first time) overlap with
    // file system traversal.
    const [sampledFiles] = await Promise.all([
      withTimeout('sampling', 1600, sampleRepresentativeFiles(selection, req.policy ?? {})),
      warmExiftool(),
      visionEnabled ? warmVisionModel() : Promise.resolve()
    ])

    const sug = new Map<string, { score: number; reasons: Set<string> }>()
    const visionTimeoutMs = req.vision?.timeoutMs ?? 1200

    // Process all files concurrently. Within each file, hebrewDate and vision also run in parallel.
    await Promise.all(
      sampledFiles.map(async (fp) => {
        // Filename heuristics are pure/sync — always run.
        try {
          for (const sig of analyzeFilenameHeuristics(fp)) addSuggestion(sug, sig.tag, sig.score, sig.reason)
        } catch {
          // ignore
        }

        const tasks: Promise<void>[] = []

        tasks.push(
          (async () => {
            try {
              const heb = await withTimeout(
                'hebrewDate',
                3500,
                analyzeHebrewDateAndHolidays(fp, { exifTimeoutMs: 1200 })
              )
              if (heb.hebrewDate) addSuggestion(sug, heb.hebrewDate, 0.65, `hebrewDate:${heb.reason}`)
              for (const h of heb.holidays) addSuggestion(sug, h, 0.6, 'holiday:hebcal')
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              console.warn(`[smartSuggest] hebrewDate failed for ${fp}: ${msg}`)
            }
          })()
        )

        if (visionEnabled) {
          tasks.push(
            (async () => {
              try {
                const vis = await withTimeout(
                  'vision',
                  visionTimeoutMs + 200,
                  analyzeVision(fp, { timeoutMs: visionTimeoutMs })
                )
                for (const v of vis) addSuggestion(sug, v.tag, Math.min(0.9, Math.max(0.1, v.score)), v.reason)
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                console.warn(`[smartSuggest] vision failed for ${fp}: ${msg}`)
              }
            })()
          )
        }

        await Promise.all(tasks)
      })
    )

    const suggestions: SmartSuggestSuggestion[] = Array.from(sug.entries())
      .map(([tag, v]) => ({ tag, score: v.score, reasons: Array.from(v.reasons) }))
      .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
      .slice(0, 40)

    parentPort?.postMessage({
      ok: true,
      sampledFiles,
      suggestions,
      elapsedMs: nowMs() - t0
    } satisfies SmartSuggestWorkerResponse)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    parentPort?.postMessage({ ok: false, error: err, elapsedMs: nowMs() - t0 } satisfies SmartSuggestWorkerErrorResponse)
  }
})

