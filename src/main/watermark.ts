import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

export interface WatermarkCompositeOptions {
  baseImagePath: string
  watermarkImagePath: string
  previewBaseImageDataUrl?: string
  blurPreviewScale?: number
  outputPath: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  toolMode?: 'none' | 'crop' | 'blur'
  selectionShape?: 'rect' | 'circle'
  selectionX?: number
  selectionY?: number
  selectionWidth?: number
  selectionHeight?: number
  blurStrength?: number
  blurFeather?: number
  focusSeparation?: number
}

export interface WatermarkPreviewOptions {
  baseImagePath: string
  toolMode?: 'none' | 'crop' | 'blur'
  selectionShape?: 'rect' | 'circle'
  selectionX?: number
  selectionY?: number
  selectionWidth?: number
  selectionHeight?: number
  blurStrength?: number
  blurFeather?: number
  focusSeparation?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function applyFeatherSoftnessCurve(transition: number, softnessSlider: number | undefined): number {
  const softness = clamp(Math.round(softnessSlider ?? 24), 0, 100) / 100
  const eased = transition * transition * (3 - 2 * transition)
  const exponent = 2.4 - softness * 1.75
  return clamp(Math.pow(eased, exponent), 0, 1)
}

function outputMimeFromPath(filePath: string): 'image/png' | 'image/jpeg' | 'image/bmp' {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/png'
}

function toReadableImagePath(filePath: string): string {
  if (filePath.startsWith('file://')) return fileURLToPath(filePath)
  return filePath
}

async function readImageSource(source: string): Promise<JimpImage> {
  if (source.startsWith('data:image/')) {
    const commaIndex = source.indexOf(',')
    if (commaIndex >= 0) {
      return await Jimp.read(Buffer.from(source.slice(commaIndex + 1), 'base64'))
    }
  }
  return await Jimp.read(toReadableImagePath(source))
}

function getSelectionRect(
  options: Pick<WatermarkCompositeOptions, 'selectionX' | 'selectionY' | 'selectionWidth' | 'selectionHeight'>,
  baseWidth: number,
  baseHeight: number
): { x: number; y: number; width: number; height: number } | null {
  if (
    typeof options.selectionX !== 'number' ||
    typeof options.selectionY !== 'number' ||
    typeof options.selectionWidth !== 'number' ||
    typeof options.selectionHeight !== 'number'
  ) {
    return null
  }

  const x = clamp(Math.round(options.selectionX), 0, Math.max(0, baseWidth - 1))
  const y = clamp(Math.round(options.selectionY), 0, Math.max(0, baseHeight - 1))
  const width = clamp(Math.round(options.selectionWidth), 1, Math.max(1, baseWidth - x))
  const height = clamp(Math.round(options.selectionHeight), 1, Math.max(1, baseHeight - y))
  return { x, y, width, height }
}

function getBlurFeatherPixels(
  sliderValue: number | undefined,
  selection: { width: number; height: number } | null
): number {
  if (!selection) return 0
  const normalized = clamp(Math.round(sliderValue ?? 24), 0, 100) / 100
  const minDimension = Math.max(1, Math.min(selection.width, selection.height))
  return clamp(Math.round(minDimension * 0.7 * normalized), 0, Math.round(minDimension * 0.8))
}

function getBlurStrengthRadius(sliderValue: number | undefined, previewScale?: number): number {
  const normalized = clamp(Math.round(sliderValue ?? 14), 0, 40) / 40
  const baseRadius = Math.pow(normalized, 1.45) * 36
  const exportAdjustedRadius =
    typeof previewScale === 'number' && previewScale > 0 && previewScale < 1 ? baseRadius / previewScale : baseRadius
  return clamp(Math.round(exportAdjustedRadius), 0, 144)
}

function getPreviewScale(width: number, height: number): number {
  const maxDimension = Math.max(width, height)
  if (maxDimension <= 1400) return 1
  return 1400 / maxDimension
}

function createBlurredBackdrop(
  source: JimpImage,
  blurAmount: number,
  maxWorkingDimension = 1800
): JimpImage {
  if (blurAmount <= 0) return source.clone() as JimpImage

  const originalWidth = source.bitmap.width
  const originalHeight = source.bitmap.height
  const scale = Math.min(1, maxWorkingDimension / Math.max(originalWidth, originalHeight))

  const working =
    scale < 1
      ? (source
          .clone()
          .resize({
            w: Math.max(1, Math.round(originalWidth * scale)),
            h: Math.max(1, Math.round(originalHeight * scale))
          }) as JimpImage)
      : (source.clone() as JimpImage)

  const scaledBlur = clamp(Math.max(1, Math.round(blurAmount * Math.max(scale, 0.35))), 1, 72)
  working.blur(scaledBlur)

  if (scale >= 1) return working

  return working.resize({ w: originalWidth, h: originalHeight }) as JimpImage
}

function isInsideSelection(
  x: number,
  y: number,
  selection: { x: number; y: number; width: number; height: number },
  shape: 'rect' | 'circle'
): boolean {
  if (shape === 'rect') return true

  const centerX = selection.x + selection.width / 2
  const centerY = selection.y + selection.height / 2
  const radiusX = Math.max(0.5, selection.width / 2)
  const radiusY = Math.max(0.5, selection.height / 2)
  const normalizedX = (x + 0.5 - centerX) / radiusX
  const normalizedY = (y + 0.5 - centerY) / radiusY
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1
}

function ellipseBoundaryDistanceAlongRay(dx: number, dy: number, radiusX: number, radiusY: number): number {
  const distance = Math.hypot(dx, dy)
  if (distance <= 1e-6) return 0
  const unitX = dx / distance
  const unitY = dy / distance
  return 1 / Math.sqrt((unitX * unitX) / (radiusX * radiusX) + (unitY * unitY) / (radiusY * radiusY))
}

function copyFocusedArea(
  source: JimpImage,
  target: JimpImage,
  selection: { x: number; y: number; width: number; height: number },
  shape: 'rect' | 'circle',
  feather: number,
  softnessSlider: number | undefined
): void {
  const sourceData = source.bitmap.data
  const targetData = target.bitmap.data

  const selectionInfluence = createSelectionInfluence(selection, shape, feather, softnessSlider)

  const startX = Math.max(0, Math.floor(selection.x - feather))
  const startY = Math.max(0, Math.floor(selection.y - feather))
  const endX = Math.min(source.bitmap.width, Math.ceil(selection.x + selection.width + feather))
  const endY = Math.min(source.bitmap.height, Math.ceil(selection.y + selection.height + feather))

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const alpha = selectionInfluence(x, y)
      if (alpha <= 0) continue
      const idx = (source.bitmap.width * y + x) * 4
      if (alpha >= 1) {
        targetData[idx] = sourceData[idx]
        targetData[idx + 1] = sourceData[idx + 1]
        targetData[idx + 2] = sourceData[idx + 2]
        targetData[idx + 3] = sourceData[idx + 3]
        continue
      }
      targetData[idx] = Math.round(targetData[idx] * (1 - alpha) + sourceData[idx] * alpha)
      targetData[idx + 1] = Math.round(targetData[idx + 1] * (1 - alpha) + sourceData[idx + 1] * alpha)
      targetData[idx + 2] = Math.round(targetData[idx + 2] * (1 - alpha) + sourceData[idx + 2] * alpha)
      targetData[idx + 3] = Math.round(targetData[idx + 3] * (1 - alpha) + sourceData[idx + 3] * alpha)
    }
  }
}

function createSelectionInfluence(
  selection: { x: number; y: number; width: number; height: number },
  shape: 'rect' | 'circle',
  feather: number,
  softnessSlider: number | undefined
): (pixelX: number, pixelY: number) => number {
  return (pixelX: number, pixelY: number): number => {
    if (feather <= 0) return isInsideSelection(pixelX, pixelY, selection, shape) ? 1 : 0

    if (shape === 'rect') {
      const centerX = pixelX + 0.5
      const centerY = pixelY + 0.5
      const outsideX = Math.max(selection.x - centerX, 0, centerX - (selection.x + selection.width))
      const outsideY = Math.max(selection.y - centerY, 0, centerY - (selection.y + selection.height))
      const distanceToInnerRect = Math.max(outsideX, outsideY)

      if (distanceToInnerRect <= 0) return 1
      if (distanceToInnerRect >= feather) return 0

      const transition = clamp(distanceToInnerRect / feather, 0, 1)
      return 1 - applyFeatherSoftnessCurve(transition, softnessSlider)
    } else {
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

      if (distance <= innerBoundary) return 1
      if (distance >= outerBoundary) return 0
      const transition = clamp((distance - innerBoundary) / Math.max(0.0001, outerBoundary - innerBoundary), 0, 1)
      return 1 - applyFeatherSoftnessCurve(transition, softnessSlider)
    }
  }
}

function applyBackgroundSeparation(
  image: JimpImage,
  selection: { x: number; y: number; width: number; height: number },
  shape: 'rect' | 'circle',
  feather: number,
  softnessSlider: number | undefined,
  separation: number
): void {
  if (separation <= 0) return

  const data = image.bitmap.data
  const influenceAt = createSelectionInfluence(selection, shape, feather, softnessSlider)
  const normalized = separation / 100
  const centerX = image.bitmap.width / 2
  const centerY = image.bitmap.height / 2
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY))

  for (let y = 0; y < image.bitmap.height; y += 1) {
    for (let x = 0; x < image.bitmap.width; x += 1) {
      const selectionInfluence = influenceAt(x, y)
      const backgroundInfluence = 1 - selectionInfluence
      const idx = (image.bitmap.width * y + x) * 4
      const vignette = clamp(Math.hypot(x - centerX, y - centerY) / maxDistance, 0, 1)
      const backgroundDim = backgroundInfluence * normalized * (0.1 + vignette * 0.18)
      const focusBoost = selectionInfluence * normalized * 0.1
      const saturationFactor = 1 + selectionInfluence * normalized * 0.28 - backgroundInfluence * normalized * 0.12

      let r = data[idx] * (1 + focusBoost - backgroundDim)
      let g = data[idx + 1] * (1 + focusBoost - backgroundDim)
      let b = data[idx + 2] * (1 + focusBoost - backgroundDim)
      const gray = r * 0.299 + g * 0.587 + b * 0.114

      r = gray + (r - gray) * saturationFactor
      g = gray + (g - gray) * saturationFactor
      b = gray + (b - gray) * saturationFactor

      data[idx] = clamp(Math.round(r), 0, 255)
      data[idx + 1] = clamp(Math.round(g), 0, 255)
      data[idx + 2] = clamp(Math.round(b), 0, 255)
    }
  }
}

function applyCircleAlphaMask(
  image: JimpImage,
  selection: { x: number; y: number; width: number; height: number }
): void {
  const data = image.bitmap.data
  for (let y = 0; y < image.bitmap.height; y += 1) {
    for (let x = 0; x < image.bitmap.width; x += 1) {
      if (isInsideSelection(x, y, selection, 'circle')) continue
      const idx = (image.bitmap.width * y + x) * 4
      data[idx + 3] = 0
    }
  }
}

export async function exportWatermarkedImage(options: WatermarkCompositeOptions): Promise<void> {
  const base = await readImageSource(options.previewBaseImageDataUrl ?? options.baseImagePath)
  const watermark = await readImageSource(options.watermarkImagePath)
  const toolMode = options.toolMode ?? 'none'
  const selectionShape = options.selectionShape ?? 'rect'
  const selection = getSelectionRect(options, base.bitmap.width, base.bitmap.height)
  let finalBase = base.clone() as JimpImage
  let offsetX = 0
  let offsetY = 0
  const usePreviewBase = !!options.previewBaseImageDataUrl && toolMode === 'blur'

  if (toolMode === 'crop' && selection) {
    finalBase = base.clone().crop({
      x: selection.x,
      y: selection.y,
      w: selection.width,
      h: selection.height
    }) as JimpImage
    offsetX = selection.x
    offsetY = selection.y
    if (selectionShape === 'circle') {
      applyCircleAlphaMask(finalBase, { x: 0, y: 0, width: selection.width, height: selection.height })
    }
  } else if (toolMode === 'blur' && selection && !usePreviewBase) {
    const blurAmount = getBlurStrengthRadius(options.blurStrength, options.blurPreviewScale)
    finalBase = createBlurredBackdrop(base, blurAmount, 1200)
    const featherAmount = getBlurFeatherPixels(options.blurFeather, selection)
    const separation = clamp(Math.round(options.focusSeparation ?? 45), 0, 100)
    if (blurAmount <= 0) finalBase = base.clone() as JimpImage
    applyBackgroundSeparation(finalBase, selection, selectionShape, featherAmount, options.blurFeather, separation)
    copyFocusedArea(base, finalBase, selection, selectionShape, featherAmount, options.blurFeather)
  }

  const width = Math.max(1, Math.round(options.width))
  const height = Math.max(1, Math.round(options.height))
  const opacity = clamp(options.opacity, 0, 1)

  const prepared = watermark.clone().resize({ w: width, h: height }).opacity(opacity)
  const maxX = Math.max(0, finalBase.bitmap.width - prepared.bitmap.width)
  const maxY = Math.max(0, finalBase.bitmap.height - prepared.bitmap.height)
  const x = clamp(Math.round(options.x) - offsetX, 0, maxX)
  const y = clamp(Math.round(options.y) - offsetY, 0, maxY)

  finalBase.composite(prepared, x, y)
  await finalBase.write(options.outputPath as `${string}.${string}`)
}

export async function renderWatermarkPreviewDataUrl(options: WatermarkPreviewOptions): Promise<string> {
  const originalBase = await Jimp.read(toReadableImagePath(options.baseImagePath))
  const toolMode = options.toolMode ?? 'none'
  const selectionShape = options.selectionShape ?? 'rect'
  const previewScale = getPreviewScale(originalBase.bitmap.width, originalBase.bitmap.height)
  const base =
    previewScale < 1
      ? (originalBase
          .clone()
          .resize({
            w: Math.max(1, Math.round(originalBase.bitmap.width * previewScale)),
            h: Math.max(1, Math.round(originalBase.bitmap.height * previewScale))
          }) as JimpImage)
      : originalBase
  const selection = getSelectionRect(
    {
      ...options,
      selectionX: typeof options.selectionX === 'number' ? options.selectionX * previewScale : options.selectionX,
      selectionY: typeof options.selectionY === 'number' ? options.selectionY * previewScale : options.selectionY,
      selectionWidth: typeof options.selectionWidth === 'number' ? options.selectionWidth * previewScale : options.selectionWidth,
      selectionHeight: typeof options.selectionHeight === 'number' ? options.selectionHeight * previewScale : options.selectionHeight
    },
    base.bitmap.width,
    base.bitmap.height
  )
  let previewBase = base.clone() as JimpImage

  if (toolMode === 'crop' && selection) {
    previewBase = base.clone().crop({
      x: selection.x,
      y: selection.y,
      w: selection.width,
      h: selection.height
    }) as JimpImage
    if (selectionShape === 'circle') {
      applyCircleAlphaMask(previewBase, { x: 0, y: 0, width: selection.width, height: selection.height })
    }
  } else if (toolMode === 'blur' && selection) {
    previewBase = createBlurredBackdrop(base, getBlurStrengthRadius(options.blurStrength), 1200)
    const blurAmount = clamp(Math.round(getBlurStrengthRadius(options.blurStrength) * Math.max(previewScale, 0.35)), 0, 36)
    const featherAmount = getBlurFeatherPixels(options.blurFeather, selection)
    const separation = clamp(Math.round(options.focusSeparation ?? 45), 0, 100)
    if (blurAmount <= 0) previewBase = base.clone() as JimpImage
    applyBackgroundSeparation(previewBase, selection, selectionShape, featherAmount, options.blurFeather, separation)
    copyFocusedArea(base, previewBase, selection, selectionShape, featherAmount, options.blurFeather)
  }

  const buffer = await previewBase.getBuffer('image/png')
  return `data:image/png;base64,${buffer.toString('base64')}`
}

export function defaultWatermarkedFilePath(baseImagePath: string): string {
  const parsed = path.parse(baseImagePath)
  return path.join(parsed.dir, `${parsed.name}-watermarked.png`)
}
