import path from 'node:path'
import { Jimp } from 'jimp'

type OrtRuntime = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => any
}

export interface ImageTensorOptions {
  size: number
  mean?: [number, number, number]
  std?: [number, number, number]
}

const DEFAULT_MEAN: [number, number, number] = [0.485, 0.456, 0.406]
const DEFAULT_STD: [number, number, number] = [0.229, 0.224, 0.225]

export async function imagePathToChwFloatTensor(
  ort: OrtRuntime,
  imagePath: string,
  opts: ImageTensorOptions
): Promise<{ tensor: any; width: number; height: number }> {
  const img = await Jimp.read(imagePath)
  const origW = img.bitmap.width
  const origH = img.bitmap.height
  const resized = img.clone().resize({ w: opts.size, h: opts.size })

  const mean = opts.mean ?? DEFAULT_MEAN
  const std = opts.std ?? DEFAULT_STD
  const size = opts.size
  const plane = size * size
  const input = new Float32Array(3 * plane)

  // Direct buffer access — Jimp v1 stores RGBA bytes in bitmap.data.
  // This avoids per-pixel function calls (≈50k calls for 224×224) and is ~50× faster.
  const data = resized.bitmap.data as Buffer
  const m0 = mean[0]
  const m1 = mean[1]
  const m2 = mean[2]
  const s0 = std[0]
  const s1 = std[1]
  const s2 = std[2]
  const inv255 = 1 / 255

  for (let i = 0, p = 0; i < plane; i += 1, p += 4) {
    const r = data[p] * inv255
    const g = data[p + 1] * inv255
    const b = data[p + 2] * inv255
    input[i] = (r - m0) / s0
    input[plane + i] = (g - m1) / s1
    input[2 * plane + i] = (b - m2) / s2
  }

  return {
    tensor: new ort.Tensor('float32', input, [1, 3, size, size]),
    width: origW,
    height: origH
  }
}

export function isProbablyImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff', '.gif', '.bmp'].includes(ext)
}

