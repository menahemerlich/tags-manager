import Konva from 'konva'
import { type WatermarkShapeRecord, watermarkShapeEffectiveStrokePx } from './watermarkShapeModel'
import { buildWatermarkShapeKonvaGroup } from './watermarkKonvaShared'

const MIN_EXPORT = 1

export type ShapeOverlayExport = {
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
}

/** Rasterize each shape to a cropped PNG in image coordinates (for main-process composite). */
export function exportWatermarkShapesToOverlays(
  shapes: WatermarkShapeRecord[],
  baseW: number,
  baseH: number
): ShapeOverlayExport[] {
  const out: ShapeOverlayExport[] = []
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-32000px;top:0;width:1px;height:1px;overflow:hidden'
  document.body.appendChild(container)

  try {
    for (const record of shapes) {
      const stage = new Konva.Stage({
        container,
        width: baseW,
        height: baseH
      })
      const layer = new Konva.Layer()
      const node = buildWatermarkShapeKonvaGroup(record)
      layer.add(node)
      stage.add(layer)
      layer.draw()

      const box = node.getClientRect({ skipStroke: false })
      const pad =
        Math.ceil(watermarkShapeEffectiveStrokePx(record.strokeWidth, record.width, record.height) / 2) + 3
      let bx = Math.floor(box.x) - pad
      let by = Math.floor(box.y) - pad
      let bw = Math.ceil(box.width) + 2 * pad
      let bh = Math.ceil(box.height) + 2 * pad

      bx = Math.max(0, bx)
      by = Math.max(0, by)
      if (bx + bw > baseW) bw = Math.max(MIN_EXPORT, baseW - bx)
      if (by + bh > baseH) bh = Math.max(MIN_EXPORT, baseH - by)
      bw = Math.max(MIN_EXPORT, Math.min(bw, baseW - bx))
      bh = Math.max(MIN_EXPORT, Math.min(bh, baseH - by))

      const dataUrl = layer.toDataURL({
        x: bx,
        y: by,
        width: bw,
        height: bh,
        pixelRatio: 1,
        mimeType: 'image/png'
      })

      out.push({
        dataUrl,
        x: bx,
        y: by,
        width: bw,
        height: bh
      })

      stage.destroy()
    }
  } finally {
    document.body.removeChild(container)
  }

  return out
}
