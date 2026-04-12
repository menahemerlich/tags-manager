import Konva from 'konva'
import type { WatermarkShapeRecord } from './watermarkShapeModel'
import { isShapeFillTransparent, watermarkShapeEffectiveStrokePx } from './watermarkShapeModel'

/**
 * Map from image pixel space to the overlay stage. When the media keeps aspect ratio,
 * sx ≈ sy; we keep both for placement and use `s` for isotropic quantities (stroke, arrow caps).
 */
export function mediaToStageScale(
  stageW: number,
  stageH: number,
  baseW: number,
  baseH: number
): { sx: number; sy: number; s: number } {
  if (baseW <= 0 || baseH <= 0 || stageW <= 0 || stageH <= 0) {
    return { sx: 1, sy: 1, s: 1 }
  }
  const sx = stageW / baseW
  const sy = stageH / baseH
  const s = (sx + sy) / 2
  return { sx, sy, s }
}

/**
 * Stroke width on the Konva stage (CSS px): clamp in **image** coordinates, then multiply by the uniform scale.
 * Matches export, which clamps in image space at scale 1.
 */
export function strokeWidthStagePxFromRecord(record: WatermarkShapeRecord, uniformScale: number): number {
  const sw = watermarkShapeEffectiveStrokePx(record.strokeWidth, record.width, record.height)
  return sw * uniformScale
}

/** Arrow head size: formulas in image pixels, then × uniformScale for the stage. */
export function arrowPointerSizesFromImageBox(w: number, h: number, uniformScale: number): { plen: number; pw: number } {
  return {
    plen: Math.min(h / 3, w / 5, 18) * uniformScale,
    pw: Math.min(h / 2, w / 4, 14) * uniformScale
  }
}

/** Shared Konva tree for export at image resolution (must match on-screen `ShapeBody`). */
export function buildWatermarkShapeKonvaGroup(record: WatermarkShapeRecord): Konva.Group {
  const { x, y, width: w, height: h, rotation, fill, stroke, strokeWidth: sw, kind } = record
  const strokeW = watermarkShapeEffectiveStrokePx(sw, w, h)
  const cx = x + w / 2
  const cy = y + h / 2
  const noFill = isShapeFillTransparent(fill)

  const g = new Konva.Group({
    x: cx,
    y: cy,
    rotation
  })

  switch (kind) {
    case 'rect':
      g.add(
        new Konva.Rect({
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          fill,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW
        })
      )
      break
    case 'ellipse':
      g.add(
        new Konva.Ellipse({
          radiusX: w / 2,
          radiusY: h / 2,
          fill,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW
        })
      )
      break
    case 'triangle':
    case 'hexagon': {
      const sides = kind === 'triangle' ? 3 : 6
      const r = Math.min(w, h) / 2
      g.add(
        new Konva.RegularPolygon({
          sides,
          radius: r,
          fill,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW,
          rotation: kind === 'triangle' ? -90 : 0
        })
      )
      break
    }
    case 'star': {
      const outer = Math.min(w, h) / 2
      const inner = outer * 0.45
      g.add(
        new Konva.Star({
          numPoints: 5,
          innerRadius: inner,
          outerRadius: outer,
          fill,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW
        })
      )
      break
    }
    case 'arrow': {
      const { plen, pw } = arrowPointerSizesFromImageBox(w, h, 1)
      g.add(
        new Konva.Arrow({
          points: [-w / 2, 0, w / 2, 0],
          fill: stroke,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW,
          pointerLength: plen,
          pointerWidth: pw
        })
      )
      break
    }
    default:
      g.add(
        new Konva.Rect({
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          fill,
          fillEnabled: !noFill,
          stroke,
          strokeWidth: strokeW
        })
      )
  }

  return g
}
