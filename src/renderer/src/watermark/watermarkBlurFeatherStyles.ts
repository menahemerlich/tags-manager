import type { CSSProperties } from 'react'
import type { WatermarkSelectionShape, WatermarkToolMode } from './watermarkTypes'

export type StageBox = { left: number; top: number; width: number; height: number }

export type FeatherPreviewGeometry = {
  inner: StageBox
  outer: StageBox
  feather: number
} | null

/** גיאומטריית ריכוך טשטוש — מעגל. */
export function buildCircleFeatherPreviewGeometry(
  activeTool: WatermarkToolMode,
  selectionShape: WatermarkSelectionShape,
  displaySelectionRect: StageBox | null,
  blurFeatherPreviewPx: number
): FeatherPreviewGeometry {
  if (activeTool !== 'blur' || selectionShape !== 'circle' || !displaySelectionRect) return null
  const feather = blurFeatherPreviewPx
  return {
    inner: displaySelectionRect,
    outer: {
      left: displaySelectionRect.left - feather,
      top: displaySelectionRect.top - feather,
      width: displaySelectionRect.width + feather * 2,
      height: displaySelectionRect.height + feather * 2
    },
    feather
  }
}

/** גיאומטריית ריכוך טשטוש — מלבן. */
export function buildRectFeatherPreviewGeometry(
  activeTool: WatermarkToolMode,
  selectionShape: WatermarkSelectionShape,
  displaySelectionRect: StageBox | null,
  blurFeatherPreviewPx: number
): FeatherPreviewGeometry {
  if (activeTool !== 'blur' || selectionShape !== 'rect' || !displaySelectionRect) return null
  const feather = blurFeatherPreviewPx
  return {
    inner: displaySelectionRect,
    outer: {
      left: displaySelectionRect.left - feather,
      top: displaySelectionRect.top - feather,
      width: displaySelectionRect.width + feather * 2,
      height: displaySelectionRect.height + feather * 2
    },
    feather
  }
}

export function circleFeatherOuterCss(geometry: FeatherPreviewGeometry): CSSProperties | null {
  if (!geometry || geometry.feather <= 0) return null
  return {
    left: geometry.outer.left,
    top: geometry.outer.top,
    width: geometry.outer.width,
    height: geometry.outer.height,
    borderRadius: '9999px'
  }
}

export function rectFeatherBandCss(geometry: FeatherPreviewGeometry): CSSProperties | null {
  if (!geometry || geometry.feather <= 0) return null
  const feather = geometry.feather
  return {
    left: geometry.outer.left,
    top: geometry.outer.top,
    width: geometry.outer.width,
    height: geometry.outer.height,
    borderRadius: '16px',
    background: 'rgba(103, 232, 249, 0.08)',
    maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    maskSize: `100% 100%, calc(100% - ${feather * 2}px) calc(100% - ${feather * 2}px)`,
    WebkitMaskSize: `100% 100%, calc(100% - ${feather * 2}px) calc(100% - ${feather * 2}px)`,
    maskPosition: `0 0, ${feather}px ${feather}px`,
    WebkitMaskPosition: `0 0, ${feather}px ${feather}px`,
    maskRepeat: 'no-repeat, no-repeat',
    WebkitMaskRepeat: 'no-repeat, no-repeat',
    maskComposite: 'exclude',
    WebkitMaskComposite: 'xor'
  }
}

export function rectFeatherOuterCss(geometry: FeatherPreviewGeometry): CSSProperties | null {
  if (!geometry || geometry.feather <= 0) return null
  return {
    left: geometry.outer.left,
    top: geometry.outer.top,
    width: geometry.outer.width,
    height: geometry.outer.height,
    borderRadius: '16px'
  }
}

export function selectionOverlayCss(
  displaySelectionRect: StageBox | null,
  activeTool: WatermarkToolMode,
  selectionShape: WatermarkSelectionShape
): CSSProperties | null {
  if (!displaySelectionRect || activeTool === 'none' || activeTool === 'text' || activeTool === 'shapes') return null
  return {
    left: displaySelectionRect.left,
    top: displaySelectionRect.top,
    width: displaySelectionRect.width,
    height: displaySelectionRect.height,
    borderRadius: selectionShape === 'circle' ? '9999px' : '12px',
    border: activeTool === 'blur' ? 'none' : undefined,
    background: activeTool === 'blur' ? 'transparent' : undefined,
    boxShadow: activeTool === 'blur' ? 'none' : undefined
  }
}

export function innerSelectionBorderCss(
  displaySelectionRect: StageBox | null,
  activeTool: WatermarkToolMode,
  selectionShape: WatermarkSelectionShape
): CSSProperties | null {
  if (!displaySelectionRect || activeTool !== 'blur') return null
  return {
    left: displaySelectionRect.left,
    top: displaySelectionRect.top,
    width: displaySelectionRect.width,
    height: displaySelectionRect.height,
    borderRadius: selectionShape === 'circle' ? '9999px' : '12px'
  }
}
