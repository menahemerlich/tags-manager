import { imagePathToChwFloatTensor, isProbablyImage } from './imageToTensor'
import { loadVisionModel, type VisionModel } from './onnxModel'
import { mapLabelsToSuggestedTags, type VisionLabelHit } from './labelMap'

export interface VisionSuggestion {
  tag: string
  score: number
  reason: string
}

export interface VisionRunOptions {
  /** Hard timeout for full vision (per file). */
  timeoutMs: number
}

let cachedModel: VisionModel | null = null
let modelLoading: Promise<VisionModel> | null = null

async function ensureModel(): Promise<VisionModel> {
  if (cachedModel) return cachedModel
  if (modelLoading) return modelLoading
  // Default expectation: you provide a small classifier model + labels under resources/models/smart-suggest/
  modelLoading = loadVisionModel({
    modelFilename: 'mobilenetv2.onnx',
    labelsFilename: 'labels.txt',
    inputSize: 224
  }).then((m) => {
    cachedModel = m
    return m
  })
  return modelLoading
}

/** Pre-load the ONNX model and runtime so the first inference call is fast. */
export async function warmVisionModel(): Promise<void> {
  try {
    await ensureModel()
  } catch {
    // Best-effort; missing model is handled later in analyzeVision.
  }
}

function topK(arr: Float32Array, k: number): { idx: number; score: number }[] {
  const best: { idx: number; score: number }[] = []
  for (let i = 0; i < arr.length; i += 1) {
    const s = arr[i] ?? 0
    if (best.length < k) {
      best.push({ idx: i, score: s })
      best.sort((a, b) => b.score - a.score)
    } else if (s > best[best.length - 1]!.score) {
      best[best.length - 1] = { idx: i, score: s }
      best.sort((a, b) => b.score - a.score)
    }
  }
  return best
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity
  for (const v of logits) max = Math.max(max, v)
  const exps = new Float32Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i += 1) {
    const e = Math.exp((logits[i] ?? 0) - max)
    exps[i] = e
    sum += e
  }
  const out = new Float32Array(logits.length)
  for (let i = 0; i < logits.length; i += 1) out[i] = exps[i] / Math.max(1e-9, sum)
  return out
}

async function runWithTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return await p
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Vision timeout')), timeoutMs))
  ])
}

export async function analyzeVision(filePath: string, opts: VisionRunOptions): Promise<VisionSuggestion[]> {
  if (!isProbablyImage(filePath)) return []
  try {
    const model = await ensureModel()
    const ort = model.ort
    const inputName = model.session.inputNames[0] as string
    const { tensor } = await runWithTimeout(
      imagePathToChwFloatTensor(ort, filePath, { size: model.config.inputSize }),
      opts.timeoutMs
    )
    const outputs = await runWithTimeout(model.session.run({ [inputName]: tensor }), opts.timeoutMs)
    const outTensor: any = outputs[Object.keys(outputs)[0] as string]
    const data = outTensor?.data
    if (!data || !(data instanceof Float32Array) || data.length === 0) return []

    const probs = softmax(data)
    const top = topK(probs, 5)
    const hits: VisionLabelHit[] = top.map((t) => ({
      label: model.labels?.[t.idx] ?? `class_${t.idx}`,
      score: t.score
    }))
    const mapped = mapLabelsToSuggestedTags(hits)
    return mapped.map((m) => ({ tag: m.tag, score: m.score, reason: m.reason }))
  } catch {
    // Safe fallback: vision layer is optional; fail silently.
    return []
  }
}

