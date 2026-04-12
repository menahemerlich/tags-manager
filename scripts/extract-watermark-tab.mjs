import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const appPath = path.join(root, 'src/renderer/src/App.tsx')
const outPath = path.join(root, 'src/renderer/src/watermark/WatermarkEditorTab.tsx')

const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)
const body = lines.slice(2281, 4694).join('\n')

const header = `import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { createPortal } from 'react-dom'
import type { BlurParams, BlurSelection } from '../../shared/types'
import {
  createBlurPreviewSource,
  createBlurredPreviewImageData,
  renderBlurPreviewDataUrl,
  type BlurPreviewSource
} from '../blurProcessor'
import WatermarkShapesStage from './WatermarkShapesStage'
import { exportWatermarkShapesToOverlays } from './watermarkShapesExport'
import { WATERMARK_SHAPE_KIND_ORDER, WatermarkShapeGlyph } from './watermarkShapeGlyphs'
import {
  createDefaultWatermarkShape,
  DEFAULT_SHAPE_FILL,
  isShapeFillTransparent,
  WATERMARK_SHAPE_KIND_LABELS,
  WATERMARK_SHAPE_STROKE_MAX,
  watermarkShapeEffectiveStrokePx,
  type WatermarkShapeRecord
} from './watermarkShapeModel'
import { VideoClipRangeBar } from './VideoClipRangeBar'
import { clampNumber, isWatermarkVideoPath, loadImageDimensions } from './watermarkHelpers'
import {
  WATERMARK_TEXT_RECT_MIN_H,
  WATERMARK_TEXT_RECT_MIN_W,
  WATERMARK_TEXT_HANDLE_LABEL,
  type WatermarkExportOverlayState,
  type WatermarkSelectionHandle,
  type WatermarkSelectionRect,
  type WatermarkSelectionShape,
  type WatermarkTextRecord,
  type WatermarkToolMode
} from './watermarkTypes'
import {
  DEFAULT_WATERMARK_TEXT_STYLE,
  WATERMARK_TEXT_AREA_PAD_X,
  WATERMARK_TEXT_AREA_PAD_Y,
  WATERMARK_TEXT_FONT_OPTIONS,
  WATERMARK_TEXT_FONT_SIZE_MIN,
  WATERMARK_TEXT_MOVE_STRIP_CSS_PX,
  WATERMARK_TEXT_MOVE_THRESHOLD_PX,
  WATERMARK_TEXT_OVERLAY_BORDER_PX,
  WATERMARK_TEXT_STRIP_BORDER_BOTTOM_PX,
  createDefaultWatermarkTextItem,
  getWatermarkTextContentRectInImage,
  watermarkTextSingleLineImageHeightPx
} from './watermarkTextModel'
import {
  rasterizeWatermarkTextForExport,
  renderWatermarkTextLayerDataUrl
} from './watermarkTextCanvas'

/** טאב עורך סימן מים: טעינת מדיה, כלים, טקסט, צורות וייצוא. */
`

fs.writeFileSync(outPath, `${header}\n${body}\n`, 'utf8')
console.log('Wrote', outPath, 'lines', body.split('\n').length)
