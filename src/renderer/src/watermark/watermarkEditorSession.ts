import type { WatermarkShapeRecord } from './watermarkShapeModel'
import type { WatermarkLayerEntry } from './watermarkLayerOrder'
import type {
  WatermarkSelectionRect,
  WatermarkSelectionShape,
  WatermarkTextRecord
} from './watermarkTypes'

/** צילום מצב עריכה (כל הכלים) לשמירה מקומית לפני מעבר כלי / המשך עבודה. */
export type WatermarkEditorSnapshot = {
  selectionRect: WatermarkSelectionRect | null
  selectionShape: WatermarkSelectionShape
  blurStrength: number
  blurFeather: number
  focusSeparation: number
  /** סדר שכבות טקסט/צורות (תחתית → עליונה). */
  layerOrder: WatermarkLayerEntry[]
  textItems: WatermarkTextRecord[]
  shapeItems: WatermarkShapeRecord[]
  watermarkRect: WatermarkSelectionRect | null
  watermarkOpacity: number
  watermarkAspectRatio: number
  watermarkImagePath: string | null
  clipStartSec: number
  clipEndSec: number
}

export function createWatermarkEditorSnapshot(input: WatermarkEditorSnapshot): WatermarkEditorSnapshot {
  return {
    ...input,
    layerOrder: input.layerOrder.map((e) => ({ ...e })),
    textItems: structuredClone(input.textItems),
    shapeItems: structuredClone(input.shapeItems),
    selectionRect: input.selectionRect ? { ...input.selectionRect } : null,
    watermarkRect: input.watermarkRect ? { ...input.watermarkRect } : null
  }
}

function snapshotToComparableJson(s: WatermarkEditorSnapshot): string {
  return JSON.stringify(s)
}

export function watermarkSnapshotsEqual(a: WatermarkEditorSnapshot, b: WatermarkEditorSnapshot): boolean {
  return snapshotToComparableJson(a) === snapshotToComparableJson(b)
}
