import type { LegacyRef, RefObject } from 'react'
import type { Dispatch, MouseEvent, PointerEvent, SetStateAction } from 'react'
import {
  WATERMARK_TEXT_HANDLE_LABEL,
  type WatermarkSelectionHandle,
  type WatermarkTextRecord,
  type WatermarkToolMode
} from './watermarkTypes'
import { getWatermarkTextContentRectInImage } from './watermarkTextModel'

const TEXT_RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const satisfies readonly Exclude<
  WatermarkSelectionHandle,
  'move'
>[]

export type WatermarkTextLayerItemProps = {
  item: WatermarkTextRecord
  stackZIndex: number
  baseImageSize: { width: number; height: number }
  stageSize: { width: number; height: number }
  activeTool: WatermarkToolMode
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
}

/** תיבת טקסט אחת על הבמה (לשימוש בעימוד שכבות משולב עם צורות). */
export function WatermarkTextLayerItem({
  item,
  stackZIndex,
  baseImageSize,
  stageSize,
  activeTool,
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
  collapsedTextPreviewUrls
}: WatermarkTextLayerItemProps) {
  const scaleX = stageSize.width / baseImageSize.width
  const scaleY = stageSize.height / baseImageSize.height
  const textInteractionEnabled = activeTool === 'text'

  const isExpanded =
    textInteractionEnabled && item.id === selectedTextId && watermarkTextFrameOpen && !!selectedText

  if (isExpanded && selectedText && displayTextRect && item.id === selectedText.id) {
    const tr = selectedText
    return (
      <div
        className="watermark-text-layer-root watermark-text-overlay-item"
        onPointerDown={(e) => onTextOverlayPointerDown(e, tr)}
        style={{
          zIndex: stackZIndex,
          left: displayTextRect.left,
          top: displayTextRect.top,
          width: displayTextRect.width,
          height: displayTextRect.height,
          color: tr.style.color,
          fontFamily: tr.style.fontFamily,
          fontSize: Math.max(
            8,
            tr.style.fontSizePx *
              Math.min(
                displayTextRect.width / Math.max(1, tr.width),
                displayTextRect.height / Math.max(1, tr.height)
              )
          ),
          fontWeight: tr.style.bold ? 700 : 400,
          fontStyle: tr.style.italic ? 'italic' : 'normal',
          direction: 'rtl',
          transform: `rotate(${tr.rotation ?? 0}deg)`,
          transformOrigin: 'center center'
        }}
      >
        {displayTextContentRect && previewTextLayerDataUrl && (
          <img
            className="watermark-text-preview-raster"
            alt=""
            draggable={false}
            src={previewTextLayerDataUrl}
            style={{
              left: displayTextContentRect.x,
              top: displayTextContentRect.y,
              width: displayTextContentRect.width,
              height: displayTextContentRect.height
            }}
          />
        )}
        <textarea
          className="watermark-text-overlay-textarea"
          ref={textInputRef as LegacyRef<HTMLTextAreaElement>}
          dir="rtl"
          autoComplete="off"
          rows={1}
          style={{
            textAlign: tr.style.textAlign,
            color: 'transparent',
            caretColor: tr.style.color
          }}
          value={tr.content}
          onChange={(e) => {
            const v = e.target.value
            setTextItems((items) => items.map((it) => (it.id === tr.id ? { ...it, content: v } : it)))
          }}
          onPointerDown={beginTextInputMoveThreshold}
          placeholder="הקלד כאן…"
          spellCheck={false}
        />
        <button
          type="button"
          className="watermark-crop-handle watermark-text-rotate-handle"
          title="סיבוב"
          aria-label="סיבוב תיבת טקסט"
          onMouseDown={(e) => {
            e.stopPropagation()
            startTextRotateDrag(e, tr)
          }}
        />
        {TEXT_RESIZE_HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            className={`watermark-crop-handle watermark-crop-handle-${handle} watermark-text-resize-handle`}
            title={`שנה גודל — ${WATERMARK_TEXT_HANDLE_LABEL[handle]}`}
            aria-label={`שנה גודל מסגרת טקסט — ${WATERMARK_TEXT_HANDLE_LABEL[handle]}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              startTextDrag(e, handle, tr)
            }}
          />
        ))}
      </div>
    )
  }

  const cr = getWatermarkTextContentRectInImage(item)
  const outerStage = {
    left: item.x * scaleX,
    top: item.y * scaleY,
    width: item.width * scaleX,
    height: item.height * scaleY
  }
  const imgLeft = (cr.x - item.x) * scaleX
  const imgTop = (cr.y - item.y) * scaleY
  const previewUrl = collapsedTextPreviewUrls.get(item.id) ?? ''

  return (
    <div
      className="watermark-text-layer-root watermark-text-collapsed-wrap"
      style={{
        zIndex: stackZIndex,
        left: outerStage.left,
        top: outerStage.top,
        width: outerStage.width,
        height: outerStage.height,
        transform: `rotate(${item.rotation ?? 0}deg)`,
        transformOrigin: 'center center',
        pointerEvents: 'auto'
      }}
    >
      <button
        type="button"
        className="watermark-text-collapsed-hit"
        onPointerDown={(e) => {
          e.stopPropagation()
          beginCollapsedTextInteraction(e, item)
        }}
        aria-label="עריכת טקסט על התמונה"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: imgLeft,
              top: imgTop,
              width: cr.width * scaleX,
              height: cr.height * scaleY
            }}
          />
        ) : (
          <span className="watermark-text-collapsed-placeholder">לחץ לעריכה</span>
        )}
      </button>
    </div>
  )
}
