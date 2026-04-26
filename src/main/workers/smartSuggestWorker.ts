import { parentPort } from 'node:worker_threads'
import type { PathKind } from '../../shared/types'
import { sampleRepresentativeFiles, type SelectionItem } from '../smartSuggest/sampling'
import { analyzeHebrewDateAndHolidays } from '../smartSuggest/hebrewDate'
import { analyzeFilenameHeuristics } from '../smartSuggest/filenameHeuristics'
import { analyzeVision } from '../smartSuggest/vision/runVision'
import { withTimeout } from '../smartSuggest/time'

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

    const sampledFiles = await withTimeout(
      'sampling',
      1600,
      sampleRepresentativeFiles(selection, req.policy ?? {})
    )
    const sug = new Map<string, { score: number; reasons: Set<string> }>()

    for (const fp of sampledFiles) {
      const heb = await withTimeout('hebrewDate', 900, analyzeHebrewDateAndHolidays(fp))
      if (heb.hebrewDate) addSuggestion(sug, heb.hebrewDate, 0.65, `hebrewDate:${heb.reason}`)
      for (const h of heb.holidays) addSuggestion(sug, h, 0.6, 'holiday:hebcal')

      for (const sig of analyzeFilenameHeuristics(fp)) addSuggestion(sug, sig.tag, sig.score, sig.reason)

      const visionEnabled = req.vision?.enabled ?? true
      if (visionEnabled) {
        const timeoutMs = req.vision?.timeoutMs ?? 900
        const vis = await withTimeout('vision', timeoutMs + 150, analyzeVision(fp, { timeoutMs }))
        for (const v of vis) addSuggestion(sug, v.tag, Math.min(0.9, Math.max(0.1, v.score)), v.reason)
      }
    }

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

