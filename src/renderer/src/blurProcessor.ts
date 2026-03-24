import type { BlurParams, BlurSelection, SelectionShape } from '../../shared/types'

export interface BlurPreviewSource {
  canvas: HTMLCanvasElement
  imageData: ImageData
  scale: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function getBlurStrengthRadius(sliderValue: number | undefined): number {
  const normalized = clamp(Math.round(sliderValue ?? 14), 0, 40) / 40
  return clamp(Math.round(Math.pow(normalized, 1.45) * 36), 0, 36)
}

function getBlurFeatherPixels(sliderValue: number | undefined, selection: { width: number; height: number } | null): number {
  if (!selection) return 0
  const normalized = clamp(Math.round(sliderValue ?? 24), 0, 100) / 100
  const minDimension = Math.max(1, Math.min(selection.width, selection.height))
  return clamp(Math.round(minDimension * 0.7 * normalized), 0, Math.round(minDimension * 0.8))
}

function ellipseBoundaryDistanceAlongRay(dx: number, dy: number, radiusX: number, radiusY: number): number {
  const distance = Math.hypot(dx, dy)
  if (distance <= 1e-6) return 0
  const unitX = dx / distance
  const unitY = dy / distance
  return 1 / Math.sqrt((unitX * unitX) / (radiusX * radiusX) + (unitY * unitY) / (radiusY * radiusY))
}

function createBlurMixAt(
  selection: BlurSelection,
  feather: number
): (pixelX: number, pixelY: number) => number {
  return (pixelX: number, pixelY: number): number => {
    if (selection.shape === 'rect') {
      const centerX = pixelX + 0.5
      const centerY = pixelY + 0.5
      const outsideX = Math.max(selection.x - centerX, 0, centerX - (selection.x + selection.width))
      const outsideY = Math.max(selection.y - centerY, 0, centerY - (selection.y + selection.height))
      const distanceToInnerRect = Math.max(outsideX, outsideY)

      if (distanceToInnerRect <= 0) return 0
      if (feather <= 0) return 1
      if (distanceToInnerRect >= feather) return 1

      return smoothstep(distanceToInnerRect / feather)
    }

    const centerX = selection.x + selection.width / 2
    const centerY = selection.y + selection.height / 2
    const innerRadiusX = Math.max(0.5, selection.width / 2)
    const innerRadiusY = Math.max(0.5, selection.height / 2)
    const outerRadiusX = innerRadiusX + feather
    const outerRadiusY = innerRadiusY + feather
    const dx = pixelX + 0.5 - centerX
    const dy = pixelY + 0.5 - centerY
    const distance = Math.hypot(dx, dy)
    const innerBoundary = ellipseBoundaryDistanceAlongRay(dx, dy, innerRadiusX, innerRadiusY)
    const outerBoundary = ellipseBoundaryDistanceAlongRay(dx, dy, outerRadiusX, outerRadiusY)

    if (distance <= innerBoundary) return 0
    if (feather <= 0 || distance >= outerBoundary) return 1

    return smoothstep((distance - innerBoundary) / Math.max(0.0001, outerBoundary - innerBoundary))
  }
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('2D canvas context is unavailable.')
  }
  return ctx
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image for blur preview.'))
    image.src = src
  })
}

function scaleSelection(selection: BlurSelection, scale: number): BlurSelection {
  return {
    ...selection,
    x: selection.x * scale,
    y: selection.y * scale,
    width: selection.width * scale,
    height: selection.height * scale
  }
}

export async function createBlurPreviewSource(imageSrc: string, maxDimension = 1000): Promise<BlurPreviewSource> {
  const image = await loadImage(imageSrc)
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
  const canvas = createCanvas(width, height)
  const ctx = getCanvasContext(canvas)
  ctx.drawImage(image, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)

  return { canvas, imageData, scale, width, height }
}

export function createBlurredPreviewImageData(source: BlurPreviewSource, params: Pick<BlurParams, 'blurStrength'>): ImageData {
  const radius = getBlurStrengthRadius(params.blurStrength)
  if (radius <= 0) return new ImageData(new Uint8ClampedArray(source.imageData.data), source.width, source.height)

  const blurredCanvas = createCanvas(source.width, source.height)
  const blurredCtx = getCanvasContext(blurredCanvas)
  blurredCtx.filter = `blur(${radius}px)`
  blurredCtx.drawImage(source.canvas, 0, 0)
  blurredCtx.filter = 'none'
  return blurredCtx.getImageData(0, 0, source.width, source.height)
}

export function renderBlurPreviewDataUrl(
  source: BlurPreviewSource,
  blurredImageData: ImageData,
  selection: BlurSelection,
  params: BlurParams
): string {
  const scaledSelection = scaleSelection(selection, source.scale)
  const feather = getBlurFeatherPixels(params.blurFeather, scaledSelection)
  const blurMixAt = createBlurMixAt(scaledSelection, feather)
  const sharp = source.imageData.data
  const blurred = blurredImageData.data
  const output = new Uint8ClampedArray(sharp.length)
  const width = source.width
  const height = source.height
  const separation = clamp(params.focusSeparation ?? 45, 0, 100) / 100
  const centerX = width / 2
  const centerY = height / 2
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) * 4
      const blurMix = blurMixAt(x, y)
      const sharpMix = 1 - blurMix

      let r = sharp[idx] * sharpMix + blurred[idx] * blurMix
      let g = sharp[idx + 1] * sharpMix + blurred[idx + 1] * blurMix
      let b = sharp[idx + 2] * sharpMix + blurred[idx + 2] * blurMix
      const a = sharp[idx + 3] * sharpMix + blurred[idx + 3] * blurMix

      const vignette = clamp(Math.hypot(x - centerX, y - centerY) / maxDistance, 0, 1)
      const backgroundDim = blurMix * separation * (0.1 + vignette * 0.18)
      const focusBoost = sharpMix * separation * 0.1
      const saturationFactor = 1 + sharpMix * separation * 0.28 - blurMix * separation * 0.12

      r *= 1 + focusBoost - backgroundDim
      g *= 1 + focusBoost - backgroundDim
      b *= 1 + focusBoost - backgroundDim

      const gray = r * 0.299 + g * 0.587 + b * 0.114
      r = gray + (r - gray) * saturationFactor
      g = gray + (g - gray) * saturationFactor
      b = gray + (b - gray) * saturationFactor

      output[idx] = clamp(Math.round(r), 0, 255)
      output[idx + 1] = clamp(Math.round(g), 0, 255)
      output[idx + 2] = clamp(Math.round(b), 0, 255)
      output[idx + 3] = clamp(Math.round(a), 0, 255)
    }
  }

  const outputCanvas = createCanvas(width, height)
  const ctx = getCanvasContext(outputCanvas)
  ctx.putImageData(new ImageData(output, width, height), 0, 0)
  return outputCanvas.toDataURL('image/png')
}

export function getScaledSelectionForPreview(source: BlurPreviewSource, selection: BlurSelection): BlurSelection {
  return scaleSelection(selection, source.scale)
}

export function getBlurIndicatorFeather(source: BlurPreviewSource, selection: BlurSelection, shape: SelectionShape, blurFeather: number): BlurSelection {
  const scaledSelection = scaleSelection({ ...selection, shape }, source.scale)
  const feather = getBlurFeatherPixels(blurFeather, scaledSelection)
  return {
    ...scaledSelection,
    x: scaledSelection.x - feather,
    y: scaledSelection.y - feather,
    width: scaledSelection.width + feather * 2,
    height: scaledSelection.height + feather * 2
  }
}
