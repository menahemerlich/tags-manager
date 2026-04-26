import path from 'node:path'
import { Jimp, intToRGBA } from 'jimp'

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
  const resized = img.clone().resize({ w: opts.size, h: opts.size })

  const mean = opts.mean ?? DEFAULT_MEAN
  const std = opts.std ?? DEFAULT_STD
  const input = new Float32Array(1 * 3 * opts.size * opts.size)

  for (let y = 0; y < opts.size; y += 1) {
    for (let x = 0; x < opts.size; x += 1) {
      const rgba = intToRGBA(resized.getPixelColor(x, y))
      const r = rgba.r / 255
      const g = rgba.g / 255
      const b = rgba.b / 255
      const idx = y * opts.size + x
      input[idx] = (r - mean[0]) / std[0]
      input[opts.size * opts.size + idx] = (g - mean[1]) / std[1]
      input[2 * opts.size * opts.size + idx] = (b - mean[2]) / std[2]
    }
  }

  return {
    tensor: new ort.Tensor('float32', input, [1, 3, opts.size, opts.size]),
    width: img.bitmap.width,
    height: img.bitmap.height
  }
}

export function isProbablyImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff', '.gif', '.bmp'].includes(ext)
}

