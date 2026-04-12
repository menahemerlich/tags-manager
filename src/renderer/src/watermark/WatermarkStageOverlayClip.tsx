import type { CSSProperties, Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react'
import type { PointerEvent } from 'react'
import WatermarkShapesStage from './WatermarkShapesStage'
import { type WatermarkShapeRecord } from './watermarkShapeModel'
import type { WatermarkLayerEntry } from './watermarkLayerOrder'
import { WatermarkTextLayerItem } from './WatermarkTextLayerItem'
import type {
  WatermarkSelectionHandle,
  WatermarkSelectionShape,
  WatermarkTextRecord,
  WatermarkToolMode
} from './watermarkTypes'

export type WatermarkStageOverlayClipProps = {
  baseIsVideo: boolean
  activeTool: WatermarkToolMode
  selectionShape: WatermarkSelectionShape
  rectFeatherBandStyle: CSSProperties | null
  rectFeatherOuterStyle: CSSProperties | null
  innerSelectionBorderStyle: CSSProperties | null
  circleFeatherOuterStyle: CSSProperties | null
  selectionOverlayStyle: CSSProperties | null
  selectionHandles: readonly WatermarkSelectionHandle[]
  startSelectionDrag: (e: MouseEvent, mode: WatermarkSelectionHandle) => void
  watermarkImageSrc: string | null
  displayRect: { left: number; top: number; width: number; height: number } | null
  watermarkOpacity: number
  startDrag: (e: MouseEvent, mode: 'move' | 'resize') => void
  baseImageSize: { width: number; height: number } | null
  stageSize: { width: number; height: number }
  shapeItems: WatermarkShapeRecord[]
  setShapeItems: Dispatch<SetStateAction<WatermarkShapeRecord[]>>
  selectedShapeId: string | null
  setSelectedShapeId: Dispatch<SetStateAction<string | null>>
  shapePlacementBounds: { x: number; y: number; width: number; height: number }
  /** סדר שכבות — ריק = מצב ישן (כל הצורות בשלב אחד + טקסט). */
  layerOrder: WatermarkLayerEntry[]
  textItems: WatermarkTextRecord[]
  selectedTextId: string | null
  watermarkTextFrameOpen: boolean
  selectedText: WatermarkTextRecord | null
  displayTextRect: { left: number; top: number; width: number; height: number } | null
  displayTextContentRect: { x: number; y: number; width: number; height: number } | null
  previewTextLayerDataUrl: string
  textInputRef: React.RefObject<HTMLTextAreaElement | null>
  setTextItems: Dispatch<SetStateAction<WatermarkTextRecord[]>>
  onTextOverlayPointerDown: (e: PointerEvent, item: WatermarkTextRecord) => void
  beginTextInputMoveThreshold: (e: PointerEvent) => void
  startTextRotateDrag: (e: MouseEvent, item: WatermarkTextRecord) => void
  startTextDrag: (e: MouseEvent, mode: WatermarkSelectionHandle, item: WatermarkTextRecord) => void
  beginCollapsedTextInteraction: (e: PointerEvent, item: WatermarkTextRecord) => void
  collapsedTextPreviewUrls: Map<string, string>
  /** גיבוי כשאין layerOrder */
  textLayersFallback: ReactNode
  onShapesToolRequested: () => void
}

/** שכבות מעל המדיה: ריכוך טשטוש, מסגרת בחירה, סימן מים, צורות, טקסט. */
export function WatermarkStageOverlayClip({
  baseIsVideo,
  activeTool,
  selectionShape,
  rectFeatherBandStyle,
  rectFeatherOuterStyle,
  innerSelectionBorderStyle,
  circleFeatherOuterStyle,
  selectionOverlayStyle,
  selectionHandles,
  startSelectionDrag,
  watermarkImageSrc,
  displayRect,
  watermarkOpacity,
  startDrag,
  baseImageSize,
  stageSize,
  shapeItems,
  setShapeItems,
  selectedShapeId,
  setSelectedShapeId,
  shapePlacementBounds,
  layerOrder,
  textItems,
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
  textLayersFallback,
  onShapesToolRequested
}: WatermarkStageOverlayClipProps) {
  const useStacking = layerOrder.length > 0 && baseImageSize && stageSize.width > 0 && stageSize.height > 0

  return (
    <div className="watermark-stage-overlay-clip">
      {!baseIsVideo && activeTool === 'blur' && selectionShape === 'rect' && rectFeatherBandStyle && (
        <div className="watermark-feather-band-rect" style={rectFeatherBandStyle} />
      )}
      {!baseIsVideo && activeTool === 'blur' && selectionShape === 'rect' && rectFeatherOuterStyle && (
        <div className="watermark-feather-outer-rect" style={rectFeatherOuterStyle} />
      )}
      {!baseIsVideo && activeTool === 'blur' && selectionShape === 'rect' && innerSelectionBorderStyle && (
        <div className="watermark-feather-inner-rect" style={innerSelectionBorderStyle} />
      )}
      {!baseIsVideo && activeTool === 'blur' && selectionShape === 'circle' && circleFeatherOuterStyle && (
        <div className="watermark-feather-outer-circle" style={circleFeatherOuterStyle} />
      )}
      {!baseIsVideo && activeTool === 'blur' && selectionShape === 'circle' && innerSelectionBorderStyle && (
        <div className="watermark-feather-inner-circle" style={innerSelectionBorderStyle} />
      )}
      {!baseIsVideo && selectionOverlayStyle && (
        <div
          className={`watermark-selection-overlay ${activeTool === 'blur' ? 'blur' : 'crop'} ${selectionShape === 'circle' ? 'circle' : 'rect'}`}
          style={selectionOverlayStyle}
          onMouseDown={(e) => startSelectionDrag(e, 'move')}
        >
          {selectionHandles.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`watermark-crop-handle watermark-crop-handle-${handle}`}
              title="שנה גודל בחירה"
              onMouseDown={(e) => startSelectionDrag(e, handle)}
            />
          ))}
        </div>
      )}
      {watermarkImageSrc && displayRect && (
        <div
          className="watermark-overlay-item"
          style={{
            left: displayRect.left,
            top: displayRect.top,
            width: displayRect.width,
            height: displayRect.height,
            opacity: watermarkOpacity
          }}
          onMouseDown={(e) => startDrag(e, 'move')}
        >
          <img src={watermarkImageSrc} alt="" draggable={false} />
          <button
            type="button"
            className="watermark-resize-handle"
            title="שנה גודל"
            onMouseDown={(e) => startDrag(e, 'resize')}
          />
        </div>
      )}
      {useStacking
        ? layerOrder.map((entry, idx) => {
            const z = 4 + idx
            if (entry.kind === 'shape') {
              const shape = shapeItems.find((s) => s.id === entry.id)
              if (!shape) return null
              return (
                <WatermarkShapesStage
                  key={`wm-shape-${entry.id}`}
                  shapes={[shape]}
                  onShapesChange={(next) => {
                    const u = next[0]
                    setShapeItems((items) => items.map((s) => (s.id === u.id ? u : s)))
                  }}
                  selectedId={selectedShapeId}
                  onSelectId={setSelectedShapeId}
                  active={activeTool === 'shapes'}
                  baseImageSize={baseImageSize}
                  stageSize={stageSize}
                  placementBounds={shapePlacementBounds}
                  stackZIndex={z}
                  onShapesToolRequested={onShapesToolRequested}
                />
              )
            }
            const item = textItems.find((t) => t.id === entry.id)
            if (!item) return null
            return (
              <WatermarkTextLayerItem
                key={`wm-text-${entry.id}`}
                item={item}
                stackZIndex={z}
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
            )
          })
        : baseImageSize &&
          stageSize.width > 0 &&
          stageSize.height > 0 && (
            <>
              <WatermarkShapesStage
                shapes={shapeItems}
                onShapesChange={setShapeItems}
                selectedId={selectedShapeId}
                onSelectId={setSelectedShapeId}
                active={activeTool === 'shapes'}
                baseImageSize={baseImageSize}
                stageSize={stageSize}
                placementBounds={shapePlacementBounds}
                onShapesToolRequested={onShapesToolRequested}
              />
              {textLayersFallback}
            </>
          )}
    </div>
  )
}
