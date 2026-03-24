import { existsSync } from 'node:fs'
import path from 'node:path'
import { Jimp, intToRGBA } from 'jimp'
import type { FaceDetection } from '../shared/types'
import { normalizePath } from '../shared/pathUtils'

type BBox = [number, number, number, number]
type OrtRuntime = {
  InferenceSession: {
    create: (modelPath: string) => Promise<OrtSession>
  }
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor
}
type OrtSession = {
  inputNames: string[]
  run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>>
}
type OrtTensor = {
  data: unknown
  dims: readonly number[]
}
interface PixelImage {
  clone: () => PixelImage
  resize: (opts: { w: number; h: number }) => PixelImage
  getPixelColor: (x: number, y: number) => number
}

const INPUT_SIZE = 640
const DET_MEAN = 127.5
const DET_STD = 128.0
const FEAT_STRIDES = [8, 16, 32]
const SCORE_THRESHOLD = 0.5
const NMS_THRESHOLD = 0.4
const MAX_FACES = 32

interface EngineState {
  initialized: boolean
  scrfdSession: OrtSession | null
  arcFaceSession: OrtSession | null
  modelsDir: string | null
}

const state: EngineState = {
  initialized: false,
  scrfdSession: null,
  arcFaceSession: null,
  modelsDir: null
}
let ortRuntime: OrtRuntime | null = null

async function loadOrtRuntime(): Promise<OrtRuntime> {
  if (ortRuntime) return ortRuntime
  try {
    const mod = (await import('onnxruntime-node')) as unknown as OrtRuntime
    ortRuntime = mod
    return ortRuntime
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      `כשל בטעינת onnxruntime-node: ${reason}. בדוק שהותקן Microsoft Visual C++ Redistributable (x64) ושאין חסימה לקבצי DLL.`
    )
  }
}

function candidateModelDirs(): string[] {
  const dirs = [
    path.resolve('resources', 'models', 'face'),
    path.resolve(process.cwd(), 'resources', 'models', 'face')
  ]
  if (process.resourcesPath) {
    dirs.push(
      path.resolve(process.resourcesPath, 'models', 'face'),
      path.resolve(process.resourcesPath, 'resources', 'models', 'face'),
      path.resolve(process.resourcesPath, 'app.asar.unpacked', 'resources', 'models', 'face'),
      path.resolve(path.dirname(process.execPath), 'resources', 'models', 'face')
    )
  }
  return [...new Set(dirs)]
}

function resolveModelsDir(): string | null {
  for (const dir of candidateModelDirs()) {
    const scrfd = path.join(dir, 'scrfd.onnx')
    const arc = path.join(dir, 'arcface.onnx')
    if (existsSync(scrfd) && existsSync(arc)) return dir
  }
  return null
}

function softNms(dets: { box: BBox; score: number }[], threshold: number): number[] {
  const keep: number[] = []
  const order = dets.map((_, i) => i).sort((a, b) => dets[b].score - dets[a].score)
  while (order.length > 0) {
    const i = order.shift() as number
    keep.push(i)
    const [x1, y1, x2, y2] = dets[i].box
    const areaI = Math.max(0, x2 - x1 + 1) * Math.max(0, y2 - y1 + 1)
    const remain: number[] = []
    for (const j of order) {
      const [xx1, yy1, xx2, yy2] = dets[j].box
      const interX1 = Math.max(x1, xx1)
      const interY1 = Math.max(y1, yy1)
      const interX2 = Math.min(x2, xx2)
      const interY2 = Math.min(y2, yy2)
      const iw = Math.max(0, interX2 - interX1 + 1)
      const ih = Math.max(0, interY2 - interY1 + 1)
      const inter = iw * ih
      const areaJ = Math.max(0, xx2 - xx1 + 1) * Math.max(0, yy2 - yy1 + 1)
      const iou = inter / Math.max(1e-8, areaI + areaJ - inter)
      if (iou <= threshold) remain.push(j)
    }
    order.splice(0, order.length, ...remain)
  }
  return keep
}

function l2Normalize(v: number[]): number[] {
  if (v.length === 0) return v
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum)
  if (!Number.isFinite(n) || n <= 0) return v
  return v.map((x) => x / n)
}

function getInputName(session: OrtSession): string {
  return session.inputNames[0] as string
}

async function ensureInitialized(): Promise<void> {
  if (state.initialized) return
  const ort = await loadOrtRuntime()
  const modelsDir = resolveModelsDir()
  if (!modelsDir) {
    throw new Error('מודלי ONNX חסרים. הרץ npm install או הוסף ידנית resources/models/face/scrfd.onnx ו-arcface.onnx')
  }
  state.scrfdSession = await ort.InferenceSession.create(path.join(modelsDir, 'scrfd.onnx'))
  state.arcFaceSession = await ort.InferenceSession.create(path.join(modelsDir, 'arcface.onnx'))
  state.initialized = true
  state.modelsDir = modelsDir
}

async function imageToScrfdTensor(imagePath: string): Promise<{ tensor: OrtTensor; scale: number; origW: number; origH: number }> {
  const ort = await loadOrtRuntime()
  const img = await Jimp.read(imagePath)
  const origW = img.bitmap.width
  const origH = img.bitmap.height
  const scale = INPUT_SIZE / Math.max(origW, origH)
  const resizedW = Math.max(1, Math.round(origW * scale))
  const resizedH = Math.max(1, Math.round(origH * scale))

  const resized = img.clone().resize({ w: resizedW, h: resizedH })
  const input = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE)

  for (let y = 0; y < INPUT_SIZE; y += 1) {
    for (let x = 0; x < INPUT_SIZE; x += 1) {
      const dstIdx = y * INPUT_SIZE + x
      if (x < resizedW && y < resizedH) {
        const rgba = intToRGBA(resized.getPixelColor(x, y))
        input[dstIdx] = (rgba.r - DET_MEAN) / DET_STD
        input[INPUT_SIZE * INPUT_SIZE + dstIdx] = (rgba.g - DET_MEAN) / DET_STD
        input[2 * INPUT_SIZE * INPUT_SIZE + dstIdx] = (rgba.b - DET_MEAN) / DET_STD
      } else {
        input[dstIdx] = (0 - DET_MEAN) / DET_STD
        input[INPUT_SIZE * INPUT_SIZE + dstIdx] = (0 - DET_MEAN) / DET_STD
        input[2 * INPUT_SIZE * INPUT_SIZE + dstIdx] = (0 - DET_MEAN) / DET_STD
      }
    }
  }

  return { tensor: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]), scale, origW, origH }
}

function sortScrfdOutputs(out: Record<string, OrtTensor>): OrtTensor[] {
  const arr = Object.values(out)
  // Similar ordering strategy to RetinaFaceJS reference: by last dim.
  return arr.sort((a, b) => (a.dims[a.dims.length - 1] as number) - (b.dims[b.dims.length - 1] as number))
}

function decodeScrfd(tensors: OrtTensor[], scale: number, origW: number, origH: number): BBox[] {
  const fmc = 3
  const numAnchors = 2
  const boxesWithScores: { box: BBox; score: number }[] = []

  for (let i = 0; i < FEAT_STRIDES.length; i += 1) {
    const stride = FEAT_STRIDES[i]
    const scoreTensor = tensors[i]
    const bboxTensor = tensors[i + fmc]
    if (!scoreTensor || !bboxTensor) continue

    const scores = Array.from(scoreTensor.data as Float32Array)
    const bboxRaw = Array.from(bboxTensor.data as Float32Array)
    const numPoints = Math.floor(bboxRaw.length / 4)

    for (let p = 0; p < numPoints; p += 1) {
      const score = scores[p] ?? 0
      if (score < SCORE_THRESHOLD) continue

      const gridIndex = Math.floor(p / numAnchors)
      const gy = Math.floor(gridIndex / (INPUT_SIZE / stride))
      const gx = gridIndex % (INPUT_SIZE / stride)
      const anchorX = gx * stride
      const anchorY = gy * stride

      const dx1 = bboxRaw[p * 4] * stride
      const dy1 = bboxRaw[p * 4 + 1] * stride
      const dx2 = bboxRaw[p * 4 + 2] * stride
      const dy2 = bboxRaw[p * 4 + 3] * stride

      const x1 = Math.max(0, (anchorX - dx1) / scale)
      const y1 = Math.max(0, (anchorY - dy1) / scale)
      const x2 = Math.min(origW - 1, (anchorX + dx2) / scale)
      const y2 = Math.min(origH - 1, (anchorY + dy2) / scale)

      if (x2 <= x1 || y2 <= y1) continue
      boxesWithScores.push({ box: [x1, y1, x2, y2], score })
    }
  }

  const keep = softNms(boxesWithScores, NMS_THRESHOLD).slice(0, MAX_FACES)
  return keep.map((k) => boxesWithScores[k].box)
}

async function extractArcFaceDescriptor(img: PixelImage): Promise<number[]> {
  if (!state.arcFaceSession) throw new Error('ArcFace session not initialized')
  const ort = await loadOrtRuntime()
  const target = img.clone().resize({ w: 112, h: 112 })
  const data = new Float32Array(1 * 3 * 112 * 112)
  for (let y = 0; y < 112; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      const idx = y * 112 + x
      const rgba = intToRGBA(target.getPixelColor(x, y))
      data[idx] = (rgba.r - 127.5) / 128.0
      data[112 * 112 + idx] = (rgba.g - 127.5) / 128.0
      data[2 * 112 * 112 + idx] = (rgba.b - 127.5) / 128.0
    }
  }
  const input = new ort.Tensor('float32', data, [1, 3, 112, 112])
  const out = await state.arcFaceSession.run({ [getInputName(state.arcFaceSession)]: input })
  const first = Object.values(out)[0] as OrtTensor
  return l2Normalize(Array.from(first.data as Float32Array))
}

export async function analyzeImageWithOnnx(imagePath: string): Promise<FaceDetection[]> {
  await ensureInitialized()
  if (!state.scrfdSession) throw new Error('SCRFD session not initialized')

  const p = normalizePath(imagePath)
  const source = await Jimp.read(p)
  const { tensor, scale, origW, origH } = await imageToScrfdTensor(p)
  const out = await state.scrfdSession.run({ [getInputName(state.scrfdSession)]: tensor })
  const sorted = sortScrfdOutputs(out)
  const boxes = decodeScrfd(sorted, scale, origW, origH)

  const faces: FaceDetection[] = []
  for (const [x1, y1, x2, y2] of boxes) {
    const cropW = Math.max(1, Math.floor(x2 - x1))
    const cropH = Math.max(1, Math.floor(y2 - y1))
    const crop = source.clone().crop({ x: Math.floor(x1), y: Math.floor(y1), w: cropW, h: cropH })
    // eslint-disable-next-line no-await-in-loop
    const descriptor = await extractArcFaceDescriptor(crop)
    faces.push({
      box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
      descriptor
    })
  }

  return faces
}

export function getFaceEngineInfo(): { initialized: boolean; modelsDir: string | null } {
  return { initialized: state.initialized, modelsDir: state.modelsDir }
}

