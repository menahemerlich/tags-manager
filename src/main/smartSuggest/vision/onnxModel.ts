import { existsSync } from 'node:fs'
import path from 'node:path'

type OrtRuntime = {
  InferenceSession: { create: (modelPath: string) => Promise<OrtSession> }
  Tensor: new (type: string, data: Float32Array, dims: number[]) => any
}

type OrtSession = {
  inputNames: string[]
  run: (feeds: Record<string, any>) => Promise<Record<string, any>>
}

export interface VisionModelConfig {
  modelFilename: string
  inputSize: number
  /** Optional labels file: one label per line. */
  labelsFilename?: string
}

export interface VisionModel {
  config: VisionModelConfig
  ort: OrtRuntime
  session: OrtSession
  labels: string[] | null
  modelPath: string
}

let ortRuntime: OrtRuntime | null = null

async function loadOrtRuntime(): Promise<OrtRuntime> {
  if (ortRuntime) return ortRuntime
  const mod = (await import('onnxruntime-node')) as unknown as OrtRuntime
  ortRuntime = mod
  return ortRuntime
}

function candidateModelDirs(): string[] {
  const dirs = [
    path.resolve('resources', 'models', 'smart-suggest'),
    path.resolve(process.cwd(), 'resources', 'models', 'smart-suggest')
  ]
  if (process.resourcesPath) {
    dirs.push(
      path.resolve(process.resourcesPath, 'models', 'smart-suggest'),
      path.resolve(process.resourcesPath, 'resources', 'models', 'smart-suggest'),
      path.resolve(process.resourcesPath, 'app.asar.unpacked', 'resources', 'models', 'smart-suggest'),
      path.resolve(path.dirname(process.execPath), 'resources', 'models', 'smart-suggest')
    )
  }
  return [...new Set(dirs)]
}

function resolveModelPath(filename: string): string | null {
  for (const dir of candidateModelDirs()) {
    const full = path.join(dir, filename)
    if (existsSync(full)) return full
  }
  return null
}

async function tryLoadLabels(labelsPath: string): Promise<string[] | null> {
  try {
    const fs = await import('node:fs/promises')
    const txt = await fs.readFile(labelsPath, 'utf-8')
    const labels = txt
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean)
    return labels.length ? labels : null
  } catch {
    return null
  }
}

export async function loadVisionModel(config: VisionModelConfig): Promise<VisionModel> {
  const ort = await loadOrtRuntime()
  const modelPath = resolveModelPath(config.modelFilename)
  if (!modelPath) {
    throw new Error(`מודל ONNX חסר ל-Smart Suggest: ${config.modelFilename}. הוסף אותו תחת resources/models/smart-suggest/`)
  }
  const session = await ort.InferenceSession.create(modelPath)
  let labels: string[] | null = null
  if (config.labelsFilename) {
    const labelsPath = resolveModelPath(config.labelsFilename)
    if (labelsPath) labels = await tryLoadLabels(labelsPath)
  }
  return { config, ort, session, labels, modelPath }
}

