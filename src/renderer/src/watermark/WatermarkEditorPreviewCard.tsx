import type { CSSProperties, LegacyRef, PointerEvent, RefObject } from 'react'
import type { Dispatch, MouseEvent, SetStateAction } from 'react'
import { VideoClipRangeBar } from './VideoClipRangeBar'
import { type WatermarkShapeRecord } from './watermarkShapeModel'
import { WatermarkShapesToolbar } from './WatermarkShapesToolbar'
import { WatermarkStageOverlayClip } from './WatermarkStageOverlayClip'
import { WatermarkStageTextLayers } from './WatermarkStageTextLayers'
import { WatermarkTextToolbar } from './WatermarkTextToolbar'
import type { WatermarkLayerEntry } from './watermarkLayerOrder'
import type { WatermarkSelectionHandle, WatermarkSelectionShape, WatermarkTextRecord, WatermarkToolMode } from './watermarkTypes'

/** פרמטרים לכרטיס התצוגה — מדיה, שכבות ופס זמן לווידאו. */
export type WatermarkEditorPreviewCardProps = {
  showWatermarkStage: boolean
  baseVideoUrl: string | null
  baseVideoRef: RefObject<HTMLVideoElement | null>
  baseImgRef: RefObject<HTMLImageElement | null>
  previewImageSrc: string | null
  stageMediaWrapRef: RefObject<HTMLDivElement | null>
  onWatermarkStagePointerDownCapture: (e: PointerEvent<HTMLDivElement>) => void
  onBaseVideoMetadata: () => void
  updateStageSize: () => void
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
  selectedShape: WatermarkShapeRecord | null
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
  startTextDrag: (e: MouseEvent, mode: WatermarkSelectionHandle, item: WatermarkTextRecord) => void
  beginCollapsedTextInteraction: (e: PointerEvent, item: WatermarkTextRecord) => void
  collapsedTextPreviewUrls: Map<string, string>
  setSelectedTextId: Dispatch<SetStateAction<string | null>>
  setWatermarkTextFrameOpen: Dispatch<SetStateAction<boolean>>
  textItems: WatermarkTextRecord[]
  videoDurationSec: number
  clipStartSec: number
  clipEndSec: number
  onClipRangeChange: (start: number, end: number) => void
  layerOrder: WatermarkLayerEntry[]
  moveTextLayerForward: () => void
  moveTextLayerBackward: () => void
  moveShapeLayerForward: () => void
  moveShapeLayerBackward: () => void
  canTextStackForward: boolean
  canTextStackBackward: boolean
  canShapeStackForward: boolean
  canShapeStackBackward: boolean
  onShapesToolRequested: () => void
}

/** כרטיס התצוגה: וידאו/תמונה, שכבות עריכה, פסי כלים תחתונים וציר זמן לווידאו. */
export function WatermarkEditorPreviewCard(props: WatermarkEditorPreviewCardProps) {
  const {
    showWatermarkStage,
    baseVideoUrl,
    baseVideoRef,
    baseImgRef,
    previewImageSrc,
    stageMediaWrapRef,
    onWatermarkStagePointerDownCapture,
    onBaseVideoMetadata,
    updateStageSize,
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
    selectedShape,
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
    setSelectedTextId,
    setWatermarkTextFrameOpen,
    textItems,
    videoDurationSec,
    clipStartSec,
    clipEndSec,
    onClipRangeChange,
    layerOrder,
    moveTextLayerForward,
    moveTextLayerBackward,
    moveShapeLayerForward,
    moveShapeLayerBackward,
    canTextStackForward,
    canTextStackBackward,
    canShapeStackForward,
    canShapeStackBackward,
    onShapesToolRequested
  } = props

  const textLayersFallback = (
    <WatermarkStageTextLayers
      baseImageSize={baseImageSize}
      stageSize={stageSize}
      activeTool={activeTool}
      textItemsRenderOrder={textItemsRenderOrder}
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

  return (
    <div className="watermark-preview-card">
      {showWatermarkStage ? (
        <div className="watermark-preview-media-col">
          <div className="watermark-stage">
            <div
              className="watermark-stage-media-wrap"
              ref={stageMediaWrapRef as LegacyRef<HTMLDivElement>}
              onPointerDownCapture={onWatermarkStagePointerDownCapture}
            >
              {baseVideoUrl ? (
                <video
                  ref={baseVideoRef as LegacyRef<HTMLVideoElement>}
                  src={baseVideoUrl}
                  controls
                  muted
                  playsInline
                  onLoadedMetadata={onBaseVideoMetadata}
                  onLoadedData={updateStageSize}
                />
              ) : (
                <img ref={baseImgRef as LegacyRef<HTMLImageElement>} src={previewImageSrc!} alt="" onLoad={updateStageSize} />
              )}
              <WatermarkStageOverlayClip
                baseIsVideo={baseIsVideo}
                activeTool={activeTool}
                selectionShape={selectionShape}
                rectFeatherBandStyle={rectFeatherBandStyle}
                rectFeatherOuterStyle={rectFeatherOuterStyle}
                innerSelectionBorderStyle={innerSelectionBorderStyle}
                circleFeatherOuterStyle={circleFeatherOuterStyle}
                selectionOverlayStyle={selectionOverlayStyle}
                selectionHandles={selectionHandles}
                startSelectionDrag={startSelectionDrag}
                watermarkImageSrc={watermarkImageSrc}
                displayRect={displayRect}
                watermarkOpacity={watermarkOpacity}
                startDrag={startDrag}
                baseImageSize={baseImageSize}
                stageSize={stageSize}
                shapeItems={shapeItems}
                setShapeItems={setShapeItems}
                selectedShapeId={selectedShapeId}
                setSelectedShapeId={setSelectedShapeId}
                shapePlacementBounds={shapePlacementBounds}
                layerOrder={layerOrder}
                textItems={textItems}
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
                textLayersFallback={textLayersFallback}
                onShapesToolRequested={onShapesToolRequested}
              />
            </div>
          </div>
          {activeTool === 'shapes' && showWatermarkStage && baseImageSize && (
            <WatermarkShapesToolbar
              baseImageSize={baseImageSize}
              baseIsVideo={baseIsVideo}
              selectedShapeId={selectedShapeId}
              setSelectedShapeId={setSelectedShapeId}
              setShapeItems={setShapeItems}
              selectedShape={selectedShape}
              onMoveLayerForward={moveShapeLayerForward}
              onMoveLayerBackward={moveShapeLayerBackward}
              canMoveForward={canShapeStackForward}
              canMoveBackward={canShapeStackBackward}
            />
          )}
          {activeTool === 'text' && showWatermarkStage && baseImageSize && (
            <WatermarkTextToolbar
              baseImageSize={baseImageSize}
              baseIsVideo={baseIsVideo}
              textItems={textItems}
              setTextItems={setTextItems}
              selectedTextId={selectedTextId}
              setSelectedTextId={setSelectedTextId}
              selectedText={selectedText}
              watermarkTextFrameOpen={watermarkTextFrameOpen}
              setWatermarkTextFrameOpen={setWatermarkTextFrameOpen}
              onMoveLayerForward={moveTextLayerForward}
              onMoveLayerBackward={moveTextLayerBackward}
              canMoveForward={canTextStackForward}
              canMoveBackward={canTextStackBackward}
            />
          )}
          {baseIsVideo && videoDurationSec > 0 && (
            <VideoClipRangeBar
              durationSec={videoDurationSec}
              startSec={clipStartSec}
              endSec={clipEndSec}
              onRangeChange={onClipRangeChange}
              videoRef={baseVideoRef}
            />
          )}
        </div>
      ) : (
        <div className="watermark-empty-state">בחר תמונה או סרטון ראשי כדי להתחיל.</div>
      )}
    </div>
  )
}
