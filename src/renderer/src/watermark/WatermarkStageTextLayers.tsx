import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { WatermarkTextRecord, WatermarkToolMode } from './watermarkTypes'
import { WatermarkTextLayerItem } from './WatermarkTextLayerItem'

export type WatermarkStageTextLayersProps = {
  baseImageSize: { width: number; height: number } | null
  stageSize: { width: number; height: number }
  activeTool: WatermarkToolMode
  textItemsRenderOrder: WatermarkTextRecord[]
  selectedTextId: string | null
  watermarkTextFrameOpen: boolean
  selectedText: WatermarkTextRecord | null
  displayTextRect: { left: number; top: number; width: number; height: number } | null
  displayTextContentRect: { x: number; y: number; width: number; height: number } | null
  previewTextLayerDataUrl: string
  textInputRef: RefObject<HTMLTextAreaElement | null>
  setTextItems: Dispatch<SetStateAction<WatermarkTextRecord[]>>
  onTextOverlayPointerDown: (e: PointerEvent, item: WatermarkTextRecord) => void
  beginTextInputMoveThreshold: (e: PointerEvent) => void
  startTextRotateDrag: (e: MouseEvent, item: WatermarkTextRecord) => void
  startTextDrag: (e: MouseEvent, mode: import('./watermarkTypes').WatermarkSelectionHandle, item: WatermarkTextRecord) => void
  beginCollapsedTextInteraction: (e: PointerEvent, item: WatermarkTextRecord) => void
  collapsedTextPreviewUrls: Map<string, string>
  /** אופציונלי — z-index לפי מזהה לשילוב עם צורות */
  stackZIndexById?: Record<string, number>
}

/** שכבות טקסט על הבמה — תצוגה מקדימה כשהתיבה סגורה, ועריכה מלאה כשפותחים. */
export function WatermarkStageTextLayers({
  baseImageSize,
  stageSize,
  activeTool,
  textItemsRenderOrder,
  selectedTextId,
  watermarkTextFrameOpen,
  selectedText,
  displayTextRect,
  displayTextContentRect,
  previewTextLayerDataUrl,
  textInputRef,
  setTextItems,
  onTextOverlayPointerDown,
  beginTextInputMoveThreshold,
  startTextRotateDrag,
  startTextDrag,
  beginCollapsedTextInteraction,
  collapsedTextPreviewUrls,
  stackZIndexById
}: WatermarkStageTextLayersProps) {
  if (!baseImageSize || stageSize.width <= 0 || stageSize.height <= 0 || textItemsRenderOrder.length === 0) {
    return null
  }

  return (
    <>
      {textItemsRenderOrder.map((item) => (
        <WatermarkTextLayerItem
          key={item.id}
          item={item}
          stackZIndex={stackZIndexById?.[item.id] ?? 6}
          baseImageSize={baseImageSize}
          stageSize={stageSize}
          activeTool={activeTool}
          selectedTextId={selectedTextId}
          watermarkTextFrameOpen={watermarkTextFrameOpen}
          selectedText={selectedText}
          displayTextRect={displayTextRect}
          displayTextContentRect={displayTextContentRect}
          previewTextLayerDataUrl={previewTextLayerDataUrl}
          textInputRef={textInputRef}
          setTextItems={setTextItems}
          onTextOverlayPointerDown={onTextOverlayPointerDown}
          beginTextInputMoveThreshold={beginTextInputMoveThreshold}
          startTextRotateDrag={startTextRotateDrag}
          startTextDrag={startTextDrag}
          beginCollapsedTextInteraction={beginCollapsedTextInteraction}
          collapsedTextPreviewUrls={collapsedTextPreviewUrls}
        />
      ))}
    </>
  )
}
