import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes
} from 'react'
import type { BlurParams, BlurSelection } from '../../../shared/types'
import { type WatermarkShapeRecord } from './watermarkShapeModel'
import { runWatermarkExport } from './watermarkEditorExport'
import { useWatermarkBlurPreview } from './useWatermarkBlurPreview'
import {
  buildCircleFeatherPreviewGeometry,
  buildRectFeatherPreviewGeometry,
  circleFeatherOuterCss,
  innerSelectionBorderCss,
  rectFeatherBandCss,
  rectFeatherOuterCss,
  selectionOverlayCss
} from './watermarkBlurFeatherStyles'
import { clampNumber, isWatermarkVideoPath, loadImageDimensions } from './watermarkHelpers'
import {
  clampWatermarkIntoBounds,
  createDefaultSelectionRect,
  getPlacementBounds,
  mapLayersAfterImageCrop,
  placeDefaultTextRect,
  placeDefaultWatermark
} from './watermarkPlacement'
import { getWatermarkToolSummary } from './watermarkToolSummary'
import {
  WATERMARK_TEXT_RECT_MIN_H,
  WATERMARK_TEXT_RECT_MIN_W,
  type WatermarkExportOverlayState,
  type WatermarkSelectionHandle,
  type WatermarkSelectionRect,
  type WatermarkSelectionShape,
  type WatermarkTextRecord,
  type WatermarkToolMode
} from './watermarkTypes'
import {
  WATERMARK_TEXT_AREA_PAD_X,
  WATERMARK_TEXT_AREA_PAD_Y,
  WATERMARK_TEXT_FONT_SIZE_MIN,
  WATERMARK_TEXT_MOVE_STRIP_CSS_PX,
  WATERMARK_TEXT_MOVE_THRESHOLD_PX,
  WATERMARK_TEXT_OVERLAY_BORDER_PX,
  WATERMARK_TEXT_STRIP_BORDER_BOTTOM_PX,
  getWatermarkTextContentRectInImage,
  watermarkTextSingleLineImageHeightPx
} from './watermarkTextModel'
import { renderWatermarkTextLayerDataUrl } from './watermarkTextCanvas'
import { WatermarkExportOverlay } from './WatermarkExportOverlay'
import { WatermarkEditorIntro } from './WatermarkEditorIntro'
import { WatermarkEditorPreviewCard } from './WatermarkEditorPreviewCard'
import { WatermarkEditorSidePanel } from './WatermarkEditorSidePanel'
import {
  createWatermarkEditorSnapshot,
  watermarkSnapshotsEqual,
  type WatermarkEditorSnapshot
} from './watermarkEditorSession'
import {
  layerIndexInStack,
  mergeLayerEntries,
  moveLayerBackward,
  moveLayerForward,
  type WatermarkLayerEntry
} from './watermarkLayerOrder'

/**
 * טאב עורך סימן מים — לוגיקת סטייט, ייצוא ותצוגה מקדימה.
 * ממשק מפוצל ל־WatermarkEditorSidePanel, WatermarkEditorPreviewCard ורכיבי משנה.
 */
export function WatermarkEditorTab({
  openFromPreview,
  onOpenFromPreviewHandled
}: {
  openFromPreview?: { path: string; id: number } | null
  onOpenFromPreviewHandled?: (handledId: number) => void
}) {
  const defaultWatermarkAssetUrl = useMemo(() => new URL('./icon.png', window.location.href).toString(), [])
  const [baseImagePath, setBaseImagePath] = useState<string | null>(null)
  const [baseImageSrc, setBaseImageSrc] = useState<string | null>(null)
  const [baseImageSize, setBaseImageSize] = useState<{ width: number; height: number } | null>(null)
  const [baseVideoUrl, setBaseVideoUrl] = useState<string | null>(null)
  const [videoDurationSec, setVideoDurationSec] = useState(0)
  const [clipStartSec, setClipStartSec] = useState(0)
  const [clipEndSec, setClipEndSec] = useState(0)
  const [watermarkImagePath, setWatermarkImagePath] = useState<string | null>(defaultWatermarkAssetUrl)
  const [watermarkImageSrc, setWatermarkImageSrc] = useState<string | null>(defaultWatermarkAssetUrl)
  const [defaultWatermarkAspectRatio, setDefaultWatermarkAspectRatio] = useState(1)
  const [watermarkAspectRatio, setWatermarkAspectRatio] = useState(1)
  const [watermarkRect, setWatermarkRect] = useState<WatermarkSelectionRect | null>(null)
  const [selectionRect, setSelectionRect] = useState<WatermarkSelectionRect | null>(null)
  const [activeTool, setActiveTool] = useState<WatermarkToolMode>('none')
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [textItems, setTextItems] = useState<WatermarkTextRecord[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [shapeItems, setShapeItems] = useState<WatermarkShapeRecord[]>([])
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  /** When false, only the exported content rect is shown (WYSIWYG); expanded shows handles + textarea. */
  const [watermarkTextFrameOpen, setWatermarkTextFrameOpen] = useState(false)
  const [selectionShape, setSelectionShape] = useState<WatermarkSelectionShape>('rect')
  const [blurStrength, setBlurStrength] = useState(14)
  const [blurFeather, setBlurFeather] = useState(24)
  const [focusSeparation, setFocusSeparation] = useState(45)
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.35)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [isExporting, setIsExporting] = useState(false)
  const [exportOverlay, setExportOverlay] = useState<WatermarkExportOverlayState>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [savedSessionSnapshot, setSavedSessionSnapshot] = useState<WatermarkEditorSnapshot | null>(null)
  /** מצב תצוגת המדיה בנקודת «שמירת שינויים» האחרונה — לשחזור אחרי ביטול (כולל תמונה אפויה בזיכרון). */
  const lastSavedSessionMediaRef = useRef<{
    baseImagePath: string
    baseImageSrc: string | null
    baseImageSize: { width: number; height: number } | null
    baseImagePixelsFromBake: boolean
    baseVideoUrl: string | null
    videoDurationSec: number
  } | null>(null)
  /** מצב טעינה ראשונית של הקובץ הנוכחי — לאיפוס אחרי שמירה (חזרה לפני כל העריכה בסשן). */
  const initialSessionBaselineRef = useRef<{
    snapshot: WatermarkEditorSnapshot
    media: {
      baseImagePath: string
      baseImageSrc: string | null
      baseImageSize: { width: number; height: number } | null
      baseImagePixelsFromBake: boolean
      baseVideoUrl: string | null
      videoDurationSec: number
    }
  } | null>(null)
  /** נתיב שכבר צולם לו baseline ראשוני (מונע כפילות במטא־דאטה של וידאו). */
  const initialBaselineCapturedForPathRef = useRef<string | null>(null)
  const [sessionSaveMsg, setSessionSaveMsg] = useState<string | null>(null)
  const [isDiscardingSession, setIsDiscardingSession] = useState(false)
  /** הבסיס במסך מגיע מ־data URL (אחרי שמירת חיתוך/טשטוש) — הייצוא חייב לשלוח פיקסלים ולא לקרוא שוב מהקובץ המקורי. */
  const [baseImagePixelsFromBake, setBaseImagePixelsFromBake] = useState(false)
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [layerOrder, setLayerOrder] = useState<WatermarkLayerEntry[]>([])

  useEffect(() => {
    setLayerOrder((prev) => mergeLayerEntries(prev, shapeItems, textItems))
  }, [shapeItems, textItems])

  const selectedText = useMemo(
    () => textItems.find((t) => t.id === selectedTextId) ?? null,
    [textItems, selectedTextId]
  )

  useEffect(() => {
    setSelectedTextId((cur) => (cur && textItems.some((t) => t.id === cur) ? cur : null))
  }, [textItems])

  const currentSessionSnapshot = useMemo(
    () =>
      createWatermarkEditorSnapshot({
        selectionRect,
        selectionShape,
        blurStrength,
        blurFeather,
        focusSeparation,
        layerOrder,
        textItems,
        shapeItems,
        watermarkRect,
        watermarkOpacity,
        watermarkAspectRatio,
        watermarkImagePath,
        clipStartSec,
        clipEndSec
      }),
    [
      blurFeather,
      blurStrength,
      clipEndSec,
      clipStartSec,
      focusSeparation,
      layerOrder,
      selectionRect,
      selectionShape,
      shapeItems,
      textItems,
      watermarkAspectRatio,
      watermarkImagePath,
      watermarkOpacity,
      watermarkRect
    ]
  )

  const hasUnsavedSessionChanges = useMemo(() => {
    if (!baseImagePath) return false
    if (savedSessionSnapshot === null) return true
    return !watermarkSnapshotsEqual(savedSessionSnapshot, currentSessionSnapshot)
  }, [baseImagePath, currentSessionSnapshot, savedSessionSnapshot])

  const isCustomWatermark = !!watermarkImagePath && watermarkImagePath !== defaultWatermarkAssetUrl
  const isSelectionToolActive = activeTool === 'crop' || activeTool === 'blur'
  const textDragStateRef = useRef<{
    textId: string
    mode: WatermarkSelectionHandle | 'rotate'
    startClientX: number
    startClientY: number
    startRect: WatermarkSelectionRect
    fontSizePx: number
    startRotation?: number
    pivotClientX?: number
    pivotClientY?: number
    startPointerAngle?: number
  } | null>(null)
  const watermarkExportInFlightRef = useRef(false)
  const baseIsVideo = useMemo(
    () => !!baseImagePath && isWatermarkVideoPath(baseImagePath),
    [baseImagePath]
  )

  useEffect(() => {
    if (!baseImagePath || !baseIsVideo || !baseImageSize || !baseVideoUrl) return
    if (!isWatermarkVideoPath(baseImagePath)) return
    if (videoDurationSec <= 0) return
    if (initialBaselineCapturedForPathRef.current === baseImagePath) return

    initialBaselineCapturedForPathRef.current = baseImagePath
    initialSessionBaselineRef.current = {
      snapshot: createWatermarkEditorSnapshot({
        selectionRect,
        selectionShape,
        blurStrength,
        blurFeather,
        focusSeparation,
        layerOrder,
        textItems,
        shapeItems,
        watermarkRect,
        watermarkOpacity,
        watermarkAspectRatio,
        watermarkImagePath,
        clipStartSec,
        clipEndSec
      }),
      media: {
        baseImagePath,
        baseImageSrc: null,
        baseImageSize,
        baseImagePixelsFromBake: false,
        baseVideoUrl,
        videoDurationSec
      }
    }
  }, [
    baseImagePath,
    baseImageSize,
    baseIsVideo,
    baseVideoUrl,
    blurFeather,
    blurStrength,
    clipEndSec,
    clipStartSec,
    focusSeparation,
    layerOrder,
    selectionRect,
    selectionShape,
    shapeItems,
    textItems,
    videoDurationSec,
    watermarkAspectRatio,
    watermarkImagePath,
    watermarkOpacity,
    watermarkRect
  ])

  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const baseVideoRef = useRef<HTMLVideoElement | null>(null)
  const stageMediaWrapRef = useRef<HTMLDivElement | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragStateRef = useRef<{
    mode: 'move' | 'resize'
    startClientX: number
    startClientY: number
    startRect: WatermarkSelectionRect
  } | null>(null)
  const selectionDragStateRef = useRef<{
    mode: WatermarkSelectionHandle
    startClientX: number
    startClientY: number
    startRect: WatermarkSelectionRect
  } | null>(null)

  const updateStageSize = useCallback(() => {
    const wrap = stageMediaWrapRef.current
    const media = baseVideoRef.current ?? baseImgRef.current
    const measureEl = wrap ?? media
    if (!measureEl) return

    const rect = measureEl.getBoundingClientRect()
    let w = Math.max(0, Math.round(rect.width))
    let h = Math.max(0, Math.round(rect.height))
    if (w <= 0 || h <= 0) {
      w = Math.max(0, Math.round(measureEl.offsetWidth))
      h = Math.max(0, Math.round(measureEl.offsetHeight))
    }
    if ((w <= 0 || h <= 0) && media) {
      w = Math.max(0, Math.round(media.offsetWidth))
      h = Math.max(0, Math.round(media.offsetHeight))
    }
    /** אותו ערך כמו קודם → אותו אובייקט state, כדי לא ליצור לולאת רינדור עם ResizeObserver / layout. */
    setStageSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
  }, [])

  const onClipRangeChange = useCallback((start: number, end: number) => {
    setClipStartSec(start)
    setClipEndSec(end)
  }, [])

  const getLiveTextContentRectInImage = useCallback(
    (rect: WatermarkSelectionRect): WatermarkSelectionRect => {
      if (!baseImageSize) return getWatermarkTextContentRectInImage(rect)
      const wrapEl = stageMediaWrapRef.current
      const inputEl = textInputRef.current
      if (!wrapEl || !inputEl) return getWatermarkTextContentRectInImage(rect)
      const wrapRect = wrapEl.getBoundingClientRect()
      const taRect = inputEl.getBoundingClientRect()
      if (wrapRect.width <= 0 || wrapRect.height <= 0 || taRect.width <= 0 || taRect.height <= 0) {
        return getWatermarkTextContentRectInImage(rect)
      }
      const cs = window.getComputedStyle(inputEl)
      const padL = Number.parseFloat(cs.paddingLeft || '0') || 0
      const padR = Number.parseFloat(cs.paddingRight || '0') || 0
      const padT = Number.parseFloat(cs.paddingTop || '0') || 0
      const padB = Number.parseFloat(cs.paddingBottom || '0') || 0
      const contentLeft = taRect.left + padL
      const contentTop = taRect.top + padT
      const contentWidth = Math.max(1, taRect.width - padL - padR)
      const contentHeight = Math.max(1, taRect.height - padT - padB)
      const scaleX = baseImageSize.width / wrapRect.width
      const scaleY = baseImageSize.height / wrapRect.height
      return {
        x: Math.round((contentLeft - wrapRect.left) * scaleX),
        y: Math.round((contentTop - wrapRect.top) * scaleY),
        width: Math.max(1, Math.round(contentWidth * scaleX)),
        height: Math.max(1, Math.round(contentHeight * scaleY))
      }
    },
    [baseImageSize]
  )

  const onBaseVideoMetadata = useCallback(() => {
    const v = baseVideoRef.current
    if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) return
    const w = v.videoWidth
    const h = v.videoHeight
    setBaseImageSize({ width: w, height: h })
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    setVideoDurationSec(dur)
    setClipStartSec(0)
    setClipEndSec(dur > 0 ? dur : 0.1)
    if (watermarkImageSrc) {
      const ratio = watermarkAspectRatio > 0 ? watermarkAspectRatio : 1
      const defaultRect = placeDefaultWatermark(w, h, ratio, { isVideo: true })
      setWatermarkRect(clampWatermarkIntoBounds(defaultRect, { width: w, height: h }, null))
    } else {
      setWatermarkRect(null)
    }
  }, [watermarkAspectRatio, watermarkImageSrc])

  const currentWatermarkBounds = useMemo(
    () => (activeTool === 'crop' ? selectionRect : null),
    [activeTool, selectionRect]
  )

  const shapePlacementBounds = useMemo(
    () =>
      baseImageSize
        ? getPlacementBounds(baseImageSize, currentWatermarkBounds)
        : { x: 0, y: 0, width: 0, height: 0 },
    [baseImageSize, currentWatermarkBounds]
  )

  const selectionHandles = useMemo(
    () =>
      (selectionShape === 'circle'
        ? (['n', 's', 'e', 'w'] as const)
        : (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const)),
    [selectionShape]
  )

  const blurFeatherPreviewPx = useMemo(() => {
    if (!selectionRect || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return 0
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    const minDimension = Math.max(1, Math.min(selectionRect.width * scaleX, selectionRect.height * scaleY))
    return clampNumber(Math.round(minDimension * 0.7 * (blurFeather / 100)), 0, Math.round(minDimension * 0.8))
  }, [baseImageSize, blurFeather, selectionRect, stageSize.height, stageSize.width])

  const blurSelection = useMemo<BlurSelection | null>(() => {
    if (!selectionRect) return null
    return {
      x: selectionRect.x,
      y: selectionRect.y,
      width: selectionRect.width,
      height: selectionRect.height,
      shape: selectionShape
    }
  }, [selectionRect, selectionShape])

  const blurParams = useMemo<BlurParams>(
    () => ({
      blurStrength,
      blurFeather,
      focusSeparation
    }),
    [blurFeather, blurStrength, focusSeparation]
  )

  const {
    processedPreviewSrc,
    blurPreviewSourceRef,
    resetBlurPreview,
    softInvalidateBlurSource
  } = useWatermarkBlurPreview({ activeTool, baseImageSrc, blurSelection, blurParams })

  const ensureSelectionRect = useCallback(() => {
    if (!baseImageSize) return
    setSelectionRect((prev) => prev ?? createDefaultSelectionRect(baseImageSize.width, baseImageSize.height))
  }, [baseImageSize])

  const blurSliderInteractionProps: InputHTMLAttributes<HTMLInputElement> = {}

  const activateTool = useCallback(
    (tool: WatermarkToolMode) => {
      if (baseImagePath && isWatermarkVideoPath(baseImagePath) && (tool === 'crop' || tool === 'blur')) {
        setEditorError('כלי חיתוך וטשטוש אינם זמינים כשהמדיה הראשית היא וידאו.')
        return
      }
      if (!baseImageSize && tool !== 'none') {
        setEditorError('ממתין לטעינת המדיה או בחר קובץ ראשי לפני שימוש בכלים.')
        return
      }
      if (tool !== 'text') {
        setWatermarkTextFrameOpen(false)
      }
      if (tool === 'text') {
        setEditorError(null)
        setActiveTool('text')
        setWatermarkTextFrameOpen(false)
        return
      }
      if (tool === 'shapes') {
        setEditorError(null)
        setActiveTool('shapes')
        return
      }
      setEditorError(null)
      setActiveTool(tool)
      if (tool !== 'none') ensureSelectionRect()
    },
    [baseImagePath, baseImageSize, ensureSelectionRect]
  )

  const handleSaveSession = useCallback(async () => {
    const shouldBakeTool =
      !baseIsVideo &&
      !!baseImageSrc &&
      !!baseImageSize &&
      !!selectionRect &&
      (baseImagePath || baseImagePixelsFromBake) &&
      (activeTool === 'crop' || activeTool === 'blur')

    if (shouldBakeTool) {
      setIsSavingSession(true)
      setEditorError(null)
      try {
        const dataUrl = await window.api.bakeWatermarkTool({
          baseImagePath: baseImagePixelsFromBake ? undefined : baseImagePath ?? undefined,
          baseImageDataUrl: baseImagePixelsFromBake ? baseImageSrc : undefined,
          toolMode: activeTool,
          selectionShape,
          selectionX: selectionRect.x,
          selectionY: selectionRect.y,
          selectionWidth: selectionRect.width,
          selectionHeight: selectionRect.height,
          blurStrength,
          blurFeather,
          focusSeparation
        })
        if (!dataUrl) {
          setEditorError('לא ניתן היה לשמור את השינויים — נסה שוב.')
          return
        }
        const dims = await loadImageDimensions(dataUrl)
        let nextWatermark = watermarkRect
        let nextTexts = textItems
        let nextShapes = shapeItems
        if (activeTool === 'crop') {
          const mapped = mapLayersAfterImageCrop(
            selectionRect.x,
            selectionRect.y,
            dims.width,
            dims.height,
            watermarkRect,
            textItems,
            shapeItems
          )
          nextWatermark = mapped.watermarkRect
          nextTexts = mapped.textItems
          nextShapes = mapped.shapeItems
        }
        const nextSel = createDefaultSelectionRect(dims.width, dims.height)
        setBaseImageSrc(dataUrl)
        setBaseImageSize(dims)
        setBaseImagePixelsFromBake(true)
        setWatermarkRect(nextWatermark)
        setTextItems(nextTexts)
        setShapeItems(nextShapes)
        setSelectedTextId((id) => (id && nextTexts.some((t) => t.id === id) ? id : null))
        setSelectedShapeId((id) => (id && nextShapes.some((s) => s.id === id) ? id : null))
        setSelectionRect(nextSel)
        setActiveTool('none')
        resetBlurPreview()
        setSavedSessionSnapshot(
          createWatermarkEditorSnapshot({
            selectionRect: nextSel,
            selectionShape,
            blurStrength,
            blurFeather,
            focusSeparation,
            layerOrder,
            textItems: nextTexts,
            shapeItems: nextShapes,
            watermarkRect: nextWatermark,
            watermarkOpacity,
            watermarkAspectRatio,
            watermarkImagePath,
            clipStartSec,
            clipEndSec
          })
        )
        setSessionSaveMsg('השינויים נשמרו — התמונה עודכנה; אפשר להמשיך עם כלים נוספים.')
        window.setTimeout(() => setSessionSaveMsg(null), 5200)
        if (baseImagePath) {
          lastSavedSessionMediaRef.current = {
            baseImagePath,
            baseImageSrc: dataUrl,
            baseImageSize: dims,
            baseImagePixelsFromBake: true,
            baseVideoUrl: null,
            videoDurationSec: 0
          }
        }
      } finally {
        setIsSavingSession(false)
      }
      return
    }

    const tol = 0.08
    const shouldTrimVideo =
      baseIsVideo &&
      !!baseImagePath &&
      videoDurationSec > 0 &&
      clipEndSec > clipStartSec &&
      !(clipStartSec <= tol && clipEndSec >= videoDurationSec - tol)

    if (shouldTrimVideo) {
      setIsSavingSession(true)
      setEditorError(null)
      try {
        const res = await window.api.trimVideoSegment({
          inputPath: baseImagePath,
          startSec: clipStartSec,
          endSec: clipEndSec
        })
        if (!res.ok) {
          setEditorError(res.error || 'חיתוך הסרט נכשל.')
          return
        }
        const newDur = clipEndSec - clipStartSec
        const url = await window.api.getMediaUrl(res.outputPath)
        setBaseImagePath(res.outputPath)
        setBaseVideoUrl(url)
        setVideoDurationSec(newDur)
        setClipStartSec(0)
        setClipEndSec(newDur)
        setSavedSessionSnapshot(
          createWatermarkEditorSnapshot({
            selectionRect,
            selectionShape,
            blurStrength,
            blurFeather,
            focusSeparation,
            layerOrder,
            textItems,
            shapeItems,
            watermarkRect,
            watermarkOpacity,
            watermarkAspectRatio,
            watermarkImagePath,
            clipStartSec: 0,
            clipEndSec: newDur
          })
        )
        setSessionSaveMsg('השינויים נשמרו — הסרט החתוך מוצג כעת.')
        window.setTimeout(() => setSessionSaveMsg(null), 5200)
        lastSavedSessionMediaRef.current = {
          baseImagePath: res.outputPath,
          baseImageSrc: null,
          baseImageSize,
          baseImagePixelsFromBake: false,
          baseVideoUrl: url,
          videoDurationSec: newDur
        }
        initialBaselineCapturedForPathRef.current = res.outputPath
      } finally {
        setIsSavingSession(false)
      }
      return
    }

    setSavedSessionSnapshot(
      createWatermarkEditorSnapshot({
        selectionRect,
        selectionShape,
        blurStrength,
        blurFeather,
        focusSeparation,
        layerOrder,
        textItems,
        shapeItems,
        watermarkRect,
        watermarkOpacity,
        watermarkAspectRatio,
        watermarkImagePath,
        clipStartSec,
        clipEndSec
      })
    )
    setEditorError(null)
    setSessionSaveMsg('השינויים נשמרו — אפשר לעבור בין כלים; הנקודה השמורה משמשת להשוואה לשינויים הבאים.')
    window.setTimeout(() => setSessionSaveMsg(null), 5200)
    if (baseImagePath) {
      lastSavedSessionMediaRef.current = {
        baseImagePath,
        baseImageSrc,
        baseImageSize,
        baseImagePixelsFromBake,
        baseVideoUrl,
        videoDurationSec
      }
    }
  }, [
    activeTool,
    baseImagePath,
    baseImagePixelsFromBake,
    baseImageSize,
    baseImageSrc,
    baseIsVideo,
    blurFeather,
    blurStrength,
    clipEndSec,
    clipStartSec,
    focusSeparation,
    layerOrder,
    resetBlurPreview,
    selectionRect,
    selectionShape,
    shapeItems,
    textItems,
    videoDurationSec,
    watermarkAspectRatio,
    watermarkImagePath,
    watermarkOpacity,
    watermarkRect
  ])

  function resetEditor(): void {
    setBaseImagePath(null)
    setBaseImageSrc(null)
    setBaseImageSize(null)
    setBaseVideoUrl(null)
    setVideoDurationSec(0)
    setClipStartSec(0)
    setClipEndSec(0)
    setWatermarkImagePath(defaultWatermarkAssetUrl)
    setWatermarkImageSrc(defaultWatermarkAssetUrl)
    setWatermarkAspectRatio(defaultWatermarkAspectRatio)
    setWatermarkRect(null)
    setSelectionRect(null)
    setActiveTool('none')
    setIsToolsOpen(false)
    setSelectionShape('rect')
    setTextItems([])
    setSelectedTextId(null)
    setShapeItems([])
    setSelectedShapeId(null)
    setWatermarkTextFrameOpen(false)
    setBlurStrength(14)
    setBlurFeather(24)
    setFocusSeparation(45)
    setWatermarkOpacity(0.35)
    resetBlurPreview()
    setStageSize({ width: 0, height: 0 })
    setIsExporting(false)
    setExportOverlay(null)
    setExportMsg(null)
    setEditorError(null)
    setSavedSessionSnapshot(null)
    lastSavedSessionMediaRef.current = null
    initialSessionBaselineRef.current = null
    initialBaselineCapturedForPathRef.current = null
    setSessionSaveMsg(null)
    setBaseImagePixelsFromBake(false)
    setLayerOrder([])
    dragStateRef.current = null
    selectionDragStateRef.current = null
  }

  useEffect(() => {
    void loadImageDimensions(defaultWatermarkAssetUrl)
      .then((dims) => {
        const ratio = dims.width / Math.max(1, dims.height)
        setDefaultWatermarkAspectRatio(ratio)
        setWatermarkAspectRatio(ratio)
      })
      .catch(() => {
        setWatermarkImagePath(null)
        setWatermarkImageSrc(null)
      })
  }, [defaultWatermarkAssetUrl])

  useEffect(() => {
    if (baseImagePath && isWatermarkVideoPath(baseImagePath)) {
      setActiveTool((prev) => (prev === 'crop' || prev === 'blur' ? 'none' : prev))
      softInvalidateBlurSource()
    }
  }, [baseImagePath, softInvalidateBlurSource])

  useEffect(() => {
    if (activeTool !== 'shapes' || shapeItems.length === 0) return
    setSelectedShapeId((cur) =>
      cur && shapeItems.some((s) => s.id === cur) ? cur : shapeItems[0].id
    )
  }, [activeTool, shapeItems])

  useEffect(() => {
    if (!watermarkTextFrameOpen || activeTool !== 'text') return
    const id = requestAnimationFrame(() => {
      textInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [watermarkTextFrameOpen, activeTool])

  useEffect(() => {
    if (!watermarkTextFrameOpen || activeTool !== 'text') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setWatermarkTextFrameOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [watermarkTextFrameOpen, activeTool])

  const selectedFontSizePx = selectedText?.style.fontSizePx

  useEffect(() => {
    if (activeTool !== 'text' || !baseImageSize || !selectedTextId || selectedFontSizePx == null) return
    /** בזמן עריכה פתוחה — רק useLayoutEffect מחשב גובה (מניעת שני עדכונים מתחרים). */
    if (watermarkTextFrameOpen) return
    const minH = watermarkTextSingleLineImageHeightPx(selectedFontSizePx)
    setTextItems((items) =>
      items.map((it) => {
        if (it.id !== selectedTextId) return it
        if (it.height >= minH) return it
        const bounds = getPlacementBounds(baseImageSize, currentWatermarkBounds)
        const y = clampNumber(it.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - minH))
        return { ...it, height: minH, y }
      })
    )
  }, [activeTool, baseImageSize, currentWatermarkBounds, selectedFontSizePx, selectedTextId, watermarkTextFrameOpen])

  useLayoutEffect(() => {
    if (!watermarkTextFrameOpen || !selectedTextId || activeTool !== 'text') return
    const ta = textInputRef.current
    const wrap = stageMediaWrapRef.current
    if (!ta || !wrap || !baseImageSize || stageSize.height <= 0) return

    setTextItems((items) => {
      const sel = items.find((t) => t.id === selectedTextId)
      if (!sel) return items

    ta.style.height = '0px'
    const sh = ta.scrollHeight
    ta.style.height = `${sh}px`
    const scaleY = baseImageSize.height / stageSize.height
    const contentHImg = sh * scaleY
    const chrome =
      2 * WATERMARK_TEXT_OVERLAY_BORDER_PX +
      WATERMARK_TEXT_MOVE_STRIP_CSS_PX +
      WATERMARK_TEXT_STRIP_BORDER_BOTTOM_PX +
      2 * WATERMARK_TEXT_AREA_PAD_Y
    const neededOuterH = Math.max(
      watermarkTextSingleLineImageHeightPx(sel.style.fontSizePx),
        Math.ceil(contentHImg + chrome)
      )

      if (Math.abs(sel.height - neededOuterH) <= 4) return items

      return items.map((it) => {
        if (it.id !== selectedTextId) return it
        const bounds = getPlacementBounds(baseImageSize, currentWatermarkBounds)
        const y = clampNumber(it.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - neededOuterH))
        return { ...it, height: neededOuterH, y }
      })
    })
    /** לא לכלול `textItems` — עדכון כאן משנה אותו ויוצר לולאה אינסופית. תוכן/גודל גופן דורשים מדידה מחדש. */
  }, [
    activeTool,
    baseImageSize,
    currentWatermarkBounds,
    selectedText?.content,
    selectedText?.style.fontSizePx,
    selectedTextId,
    stageSize.height,
    watermarkTextFrameOpen
  ])

  useEffect(() => {
    if (!baseImageSrc && !baseVideoUrl) return
    updateStageSize()
    const wrap = stageMediaWrapRef.current
    const media = baseVideoRef.current ?? baseImgRef.current
    const roTarget = wrap ?? media
    if (!roTarget || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateStageSize())
    observer.observe(roTarget)
    window.addEventListener('resize', updateStageSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateStageSize)
    }
  }, [baseImageSrc, baseVideoUrl, updateStageSize])

  /** אחרי פריסה / צביעת מסך — לעיתים getBoundingClientRect(0) לפני layout; רענון מבטיח תיבות טקסט. */
  useLayoutEffect(() => {
    if (!baseImageSrc && !baseVideoUrl) return
    updateStageSize()
    const id = requestAnimationFrame(() => updateStageSize())
    return () => cancelAnimationFrame(id)
  }, [baseImageSrc, baseVideoUrl, baseImageSize, activeTool, updateStageSize])

  useEffect(() => {
    if (!baseImageSize || activeTool === 'none' || activeTool === 'text' || activeTool === 'shapes') return
    setSelectionRect((prev) => prev ?? createDefaultSelectionRect(baseImageSize.width, baseImageSize.height))
  }, [activeTool, baseImageSize])

  useEffect(() => {
    if (!baseImageSize) return
    setTextItems((items) =>
      items.map((it) => {
        const next = clampWatermarkIntoBounds(it, baseImageSize, currentWatermarkBounds)
        if (
          it.x === next.x &&
          it.y === next.y &&
          it.width === next.width &&
          it.height === next.height
        ) {
          return it
        }
        return { ...it, ...next }
      })
    )
  }, [baseImageSize, currentWatermarkBounds])

  useEffect(() => {
    if (!baseImageSize) return
    setWatermarkRect((prev) => {
      if (!prev) return prev
      const next = clampWatermarkIntoBounds(prev, baseImageSize, currentWatermarkBounds)
      if (
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev
      }
      return next
    })
  }, [baseImageSize, currentWatermarkBounds])

  const endDrag = useCallback(() => {
    dragStateRef.current = null
    selectionDragStateRef.current = null
    textDragStateRef.current = null
  }, [])

  const handleGlobalTextMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = textDragStateRef.current
      if (!drag || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return

      const scaleX = baseImageSize.width / stageSize.width
      const scaleY = baseImageSize.height / stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY
      const bounds = getPlacementBounds(baseImageSize, currentWatermarkBounds)

      const applyRect = (next: WatermarkSelectionRect) => {
        setTextItems((items) =>
          items.map((it) => (it.id === drag.textId ? { ...it, ...clampWatermarkIntoBounds(next, baseImageSize, currentWatermarkBounds) } : it))
        )
      }

      if (drag.mode === 'rotate') {
        const pvx = drag.pivotClientX!
        const pvy = drag.pivotClientY!
        const a1 = Math.atan2(event.clientY - pvy, event.clientX - pvx)
        const deltaDeg = ((a1 - drag.startPointerAngle!) * 180) / Math.PI
        const nextRot = drag.startRotation! + deltaDeg
        setTextItems((items) =>
          items.map((it) => (it.id === drag.textId ? { ...it, rotation: nextRot } : it))
        )
        return
      }

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        applyRect({
          ...drag.startRect,
          x: Math.round(
            clampNumber(drag.startRect.x + deltaX, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))
          ),
          y: Math.round(
            clampNumber(drag.startRect.y + deltaY, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height))
          )
        })
        return
      }

      const minW = WATERMARK_TEXT_RECT_MIN_W
      const minH = WATERMARK_TEXT_RECT_MIN_H
      let nextX = drag.startRect.x
      let nextY = drag.startRect.y
      let nextWidth = drag.startRect.width
      let nextHeight = drag.startRect.height

      if (drag.mode.includes('e')) {
        nextWidth = clampNumber(
          drag.startRect.width + deltaX,
          minW,
          Math.max(minW, bounds.x + bounds.width - drag.startRect.x)
        )
      }
      if (drag.mode.includes('s')) {
        nextHeight = clampNumber(
          drag.startRect.height + deltaY,
          minH,
          Math.max(minH, bounds.y + bounds.height - drag.startRect.y)
        )
      }
      if (drag.mode.includes('w')) {
        const proposedX = clampNumber(
          drag.startRect.x + deltaX,
          bounds.x,
          drag.startRect.x + drag.startRect.width - minW
        )
        nextWidth = drag.startRect.width - (proposedX - drag.startRect.x)
        nextX = proposedX
      }
      if (drag.mode.includes('n')) {
        const proposedY = clampNumber(
          drag.startRect.y + deltaY,
          bounds.y,
          drag.startRect.y + drag.startRect.height - minH
        )
        nextHeight = drag.startRect.height - (proposedY - drag.startRect.y)
        nextY = proposedY
      }

      applyRect({
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight)
      })
    },
    [baseImageSize, currentWatermarkBounds, stageSize.height, stageSize.width]
  )

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = dragStateRef.current
      if (!drag || !baseImageSize || !watermarkRect || stageSize.width <= 0 || stageSize.height <= 0) return

      const scaleX = baseImageSize.width / stageSize.width
      const scaleY = baseImageSize.height / stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY
      const bounds = getPlacementBounds(baseImageSize, currentWatermarkBounds)

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        setWatermarkRect({
          ...drag.startRect,
          x: Math.round(clampNumber(drag.startRect.x + deltaX, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
          y: Math.round(clampNumber(drag.startRect.y + deltaY, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
        })
        return
      }

      const ratio = watermarkAspectRatio > 0 ? watermarkAspectRatio : drag.startRect.width / Math.max(1, drag.startRect.height)
      const widthDelta = Math.max(deltaX, deltaY * ratio)
      let nextWidth = clampNumber(drag.startRect.width + widthDelta, 40, Math.max(40, bounds.x + bounds.width - drag.startRect.x))
      let nextHeight = nextWidth / ratio
      if (drag.startRect.y + nextHeight > bounds.y + bounds.height) {
        nextHeight = bounds.y + bounds.height - drag.startRect.y
        nextWidth = nextHeight * ratio
      }
      setWatermarkRect({
        ...drag.startRect,
        width: Math.round(Math.max(40, nextWidth)),
        height: Math.round(Math.max(40, nextHeight))
      })
    },
    [baseImageSize, currentWatermarkBounds, stageSize.height, stageSize.width, watermarkAspectRatio, watermarkRect]
  )

  const handleGlobalSelectionMouseMove = useCallback(
    (event: MouseEvent) => {
      const drag = selectionDragStateRef.current
      if (!drag || !baseImageSize || !selectionRect || stageSize.width <= 0 || stageSize.height <= 0) return

      const scaleX = baseImageSize.width / stageSize.width
      const scaleY = baseImageSize.height / stageSize.height
      const deltaX = (event.clientX - drag.startClientX) * scaleX
      const deltaY = (event.clientY - drag.startClientY) * scaleY

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        const nextSelection = {
          ...drag.startRect,
          x: Math.round(clampNumber(drag.startRect.x + deltaX, 0, Math.max(0, baseImageSize.width - width))),
          y: Math.round(clampNumber(drag.startRect.y + deltaY, 0, Math.max(0, baseImageSize.height - height)))
        }
        setSelectionRect(nextSelection)
        if (activeTool === 'crop') {
          setWatermarkRect((prev) => (prev ? clampWatermarkIntoBounds(prev, baseImageSize, nextSelection) : prev))
        }
        return
      }

      let nextX = drag.startRect.x
      let nextY = drag.startRect.y
      let nextWidth = drag.startRect.width
      let nextHeight = drag.startRect.height

      if (drag.mode.includes('e')) {
        nextWidth = clampNumber(drag.startRect.width + deltaX, 80, Math.max(80, baseImageSize.width - drag.startRect.x))
      }
      if (drag.mode.includes('s')) {
        nextHeight = clampNumber(drag.startRect.height + deltaY, 80, Math.max(80, baseImageSize.height - drag.startRect.y))
      }
      if (drag.mode.includes('w')) {
        const proposedX = clampNumber(drag.startRect.x + deltaX, 0, drag.startRect.x + drag.startRect.width - 80)
        nextWidth = drag.startRect.width - (proposedX - drag.startRect.x)
        nextX = proposedX
      }
      if (drag.mode.includes('n')) {
        const proposedY = clampNumber(drag.startRect.y + deltaY, 0, drag.startRect.y + drag.startRect.height - 80)
        nextHeight = drag.startRect.height - (proposedY - drag.startRect.y)
        nextY = proposedY
      }

      const nextSelection = {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight)
      }
      setSelectionRect(nextSelection)
      if (activeTool === 'crop') {
        setWatermarkRect((prev) => (prev ? clampWatermarkIntoBounds(prev, baseImageSize, nextSelection) : prev))
      }
    },
    [activeTool, baseImageSize, selectionRect, stageSize.height, stageSize.width]
  )

  useEffect(() => {
    const onMouseUp = () => endDrag()
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mousemove', handleGlobalSelectionMouseMove)
    window.addEventListener('mousemove', handleGlobalTextMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mousemove', handleGlobalSelectionMouseMove)
      window.removeEventListener('mousemove', handleGlobalTextMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [endDrag, handleGlobalMouseMove, handleGlobalSelectionMouseMove, handleGlobalTextMouseMove])

  async function applyBaseMediaPath(nextPath: string): Promise<void> {
    setEditorError(null)
    setExportMsg(null)
    setSavedSessionSnapshot(null)
    lastSavedSessionMediaRef.current = null
    initialSessionBaselineRef.current = null
    initialBaselineCapturedForPathRef.current = null
    setSessionSaveMsg(null)
    setBaseImagePixelsFromBake(false)
    if (isWatermarkVideoPath(nextPath)) {
      setActiveTool('none')
      softInvalidateBlurSource()
      setBaseImageSrc(null)
      setBaseImageSize(null)
      setSelectionRect(null)
      setWatermarkRect(null)
      setTextItems([])
      setSelectedTextId(null)
      setShapeItems([])
      setSelectedShapeId(null)
      setBaseImagePath(nextPath)
      try {
        const url = await window.api.getMediaUrl(nextPath)
        setBaseVideoUrl(url)
      } catch {
        setEditorError('טעינת הסרט נכשלה.')
        setBaseImagePath(null)
        setBaseVideoUrl(null)
        return
      }
      setVideoDurationSec(0)
      setClipStartSec(0)
      setClipEndSec(0)
      return
    }
    setBaseVideoUrl(null)
    setVideoDurationSec(0)
    setClipStartSec(0)
    setClipEndSec(0)
    setTextItems([])
    setSelectedTextId(null)
    setShapeItems([])
    setSelectedShapeId(null)
    const nextSrc = await window.api.getImageDataUrl(nextPath)
    if (!nextSrc) {
      setEditorError('טעינת התמונה הראשית נכשלה.')
      return
    }
    const dims = await loadImageDimensions(nextSrc)
    setBaseImagePath(nextPath)
    setBaseImageSrc(nextSrc)
    setBaseImageSize(dims)
    const nextSelection = activeTool !== 'none' ? createDefaultSelectionRect(dims.width, dims.height) : selectionRect
    let nextWatermarkRect: WatermarkSelectionRect | null = null
    if (watermarkImageSrc) {
      const defaultRect = placeDefaultWatermark(dims.width, dims.height, watermarkAspectRatio)
      nextWatermarkRect = clampWatermarkIntoBounds(defaultRect, dims, activeTool === 'crop' ? nextSelection : null)
      setWatermarkRect(nextWatermarkRect)
    } else {
      setWatermarkRect(null)
    }
    setSelectionRect(nextSelection)
    initialBaselineCapturedForPathRef.current = nextPath
    initialSessionBaselineRef.current = {
      snapshot: createWatermarkEditorSnapshot({
        selectionRect: nextSelection,
        selectionShape,
        blurStrength,
        blurFeather,
        focusSeparation,
        layerOrder: [],
        textItems: [],
        shapeItems: [],
        watermarkRect: nextWatermarkRect,
        watermarkOpacity,
        watermarkAspectRatio,
        watermarkImagePath,
        clipStartSec: 0,
        clipEndSec: 0
      }),
      media: {
        baseImagePath: nextPath,
        baseImageSrc: nextSrc,
        baseImageSize: dims,
        baseImagePixelsFromBake: false,
        baseVideoUrl: null,
        videoDurationSec: 0
      }
    }
  }

  const handleDiscardSessionChanges = useCallback(async () => {
    if (!baseImagePath || (!baseImageSrc && !baseVideoUrl)) return
    setIsDiscardingSession(true)
    setEditorError(null)

    const applySnapshotAndMedia = async (snap: WatermarkEditorSnapshot, media: NonNullable<typeof lastSavedSessionMediaRef.current>) => {
      if (media.baseImagePath) {
        setBaseImagePath(media.baseImagePath)
        setBaseImageSrc(media.baseImageSrc)
        setBaseImageSize(media.baseImageSize)
        setBaseImagePixelsFromBake(media.baseImagePixelsFromBake)
        setBaseVideoUrl(media.baseVideoUrl)
        setVideoDurationSec(media.videoDurationSec)
      }

      setSelectionRect(snap.selectionRect)
      setSelectionShape(snap.selectionShape)
      setBlurStrength(snap.blurStrength)
      setBlurFeather(snap.blurFeather)
      setFocusSeparation(snap.focusSeparation)
      setLayerOrder(structuredClone(snap.layerOrder))
      setTextItems(structuredClone(snap.textItems))
      setShapeItems(structuredClone(snap.shapeItems))
      setWatermarkRect(snap.watermarkRect)
      setWatermarkOpacity(snap.watermarkOpacity)
      setWatermarkAspectRatio(snap.watermarkAspectRatio)
      setClipStartSec(snap.clipStartSec)
      setClipEndSec(snap.clipEndSec)

      const wp = snap.watermarkImagePath
      if (!wp || wp === defaultWatermarkAssetUrl) {
        setWatermarkImagePath(defaultWatermarkAssetUrl)
        setWatermarkImageSrc(defaultWatermarkAssetUrl)
      } else {
        setWatermarkImagePath(wp)
        try {
          const src = await window.api.getImageDataUrl(wp)
          if (src) setWatermarkImageSrc(src)
        } catch {
          setEditorError('טעינת סימן המים נכשלה.')
        }
      }

      setSelectedTextId((id) => (id && snap.textItems.some((t) => t.id === id) ? id : null))
      setSelectedShapeId((id) => (id && snap.shapeItems.some((s) => s.id === id) ? id : null))
      resetBlurPreview()
    }

    try {
      setActiveTool('none')
      setWatermarkTextFrameOpen(false)
      setSessionSaveMsg(null)

      if (savedSessionSnapshot === null) {
        await applyBaseMediaPath(baseImagePath)
        setSessionSaveMsg('השינויים בוטלו — הוחזר קובץ המקור מהדיסק.')
        window.setTimeout(() => setSessionSaveMsg(null), 4200)
        return
      }

      if (hasUnsavedSessionChanges) {
        const snap = createWatermarkEditorSnapshot(savedSessionSnapshot)
        const media =
          lastSavedSessionMediaRef.current ?? {
            baseImagePath,
            baseImageSrc,
            baseImageSize,
            baseImagePixelsFromBake,
            baseVideoUrl,
            videoDurationSec
          }
        if (media.baseImagePath) {
          await applySnapshotAndMedia(snap, media)
        }
        setSessionSaveMsg('חזרה למצב השמור האחרון.')
        window.setTimeout(() => setSessionSaveMsg(null), 4200)
        return
      }

      const initial = initialSessionBaselineRef.current
      if (initial) {
        await applySnapshotAndMedia(
          createWatermarkEditorSnapshot(initial.snapshot),
          initial.media
        )
        setSavedSessionSnapshot(null)
        lastSavedSessionMediaRef.current = null
        setSessionSaveMsg('הוחזר למצב הטעינה הראשונית של הקובץ (לפני השמירות בסשן).')
        window.setTimeout(() => setSessionSaveMsg(null), 5200)
        return
      }

      await applyBaseMediaPath(baseImagePath)
      setSessionSaveMsg('השינויים בוטלו — הוחזר קובץ המקור מהדיסק.')
      window.setTimeout(() => setSessionSaveMsg(null), 4200)
    } finally {
      setIsDiscardingSession(false)
    }
  }, [
    applyBaseMediaPath,
    baseImagePath,
    baseImagePixelsFromBake,
    baseImageSize,
    baseImageSrc,
    baseVideoUrl,
    defaultWatermarkAssetUrl,
    hasUnsavedSessionChanges,
    resetBlurPreview,
    savedSessionSnapshot,
    videoDurationSec
  ])

  useEffect(() => {
    if (!openFromPreview) return
    const { path, id } = openFromPreview
    let cancelled = false
    void (async () => {
      try {
        await applyBaseMediaPath(path)
      } finally {
        if (!cancelled) onOpenFromPreviewHandled?.(id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openFromPreview]) // eslint-disable-line react-hooks/exhaustive-deps -- handoff only when `openFromPreview` reference changes

  async function pickBaseMedia(): Promise<void> {
    const nextPath = await window.api.pickWatermarkBase()
    if (!nextPath) return
    await applyBaseMediaPath(nextPath)
  }

  async function pickWatermarkImage(): Promise<void> {
    setEditorError(null)
    setExportMsg(null)
    const nextPath = await window.api.pickImage()
    if (!nextPath) return
    const nextSrc = await window.api.getImageDataUrl(nextPath)
    if (!nextSrc) {
      setEditorError('טעינת סימן המים נכשלה.')
      return
    }
    const dims = await loadImageDimensions(nextSrc)
    const ratio = dims.width / Math.max(1, dims.height)
    setWatermarkImagePath(nextPath)
    setWatermarkImageSrc(nextSrc)
    setWatermarkAspectRatio(ratio)
    if (baseImageSize) {
      const nextRect = placeDefaultWatermark(baseImageSize.width, baseImageSize.height, ratio)
      setWatermarkRect(clampWatermarkIntoBounds(nextRect, baseImageSize, currentWatermarkBounds))
    }
  }

  function resetWatermarkToDefault(): void {
    setWatermarkImagePath(defaultWatermarkAssetUrl)
    setWatermarkImageSrc(defaultWatermarkAssetUrl)
    setWatermarkAspectRatio(defaultWatermarkAspectRatio)
    if (baseImageSize) {
      const nextRect = placeDefaultWatermark(baseImageSize.width, baseImageSize.height, defaultWatermarkAspectRatio)
      setWatermarkRect(clampWatermarkIntoBounds(nextRect, baseImageSize, currentWatermarkBounds))
    }
  }

  function startDrag(event: React.MouseEvent, mode: 'move' | 'resize'): void {
    if (!watermarkRect) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: watermarkRect
    }
  }

  function startSelectionDrag(event: React.MouseEvent, mode: WatermarkSelectionHandle): void {
    if (!selectionRect) return
    event.preventDefault()
    event.stopPropagation()
    selectionDragStateRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: selectionRect
    }
  }

  function startTextDragAt(
    clientX: number,
    clientY: number,
    mode: WatermarkSelectionHandle,
    item: WatermarkTextRecord
  ): void {
    textDragStateRef.current = {
      textId: item.id,
      mode,
      startClientX: clientX,
      startClientY: clientY,
      startRect: { x: item.x, y: item.y, width: item.width, height: item.height },
      fontSizePx: item.style.fontSizePx
    }
  }

  function startTextDrag(event: React.MouseEvent, mode: WatermarkSelectionHandle, item: WatermarkTextRecord): void {
    event.preventDefault()
    event.stopPropagation()
    startTextDragAt(event.clientX, event.clientY, mode, item)
  }

  function startTextRotateDrag(event: React.MouseEvent, item: WatermarkTextRecord): void {
    event.preventDefault()
    event.stopPropagation()
    const wrap = stageMediaWrapRef.current?.getBoundingClientRect()
    if (!wrap || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return
    const sx = stageSize.width / baseImageSize.width
    const sy = stageSize.height / baseImageSize.height
    const cxStage = (item.x + item.width / 2) * sx
    const cyStage = (item.y + item.height / 2) * sy
    const pivotClientX = wrap.left + cxStage
    const pivotClientY = wrap.top + cyStage
    const startPointerAngle = Math.atan2(event.clientY - pivotClientY, event.clientX - pivotClientX)
    textDragStateRef.current = {
      textId: item.id,
      mode: 'rotate',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: { x: item.x, y: item.y, width: item.width, height: item.height },
      fontSizePx: item.style.fontSizePx,
      startRotation: item.rotation ?? 0,
      pivotClientX,
      pivotClientY,
      startPointerAngle
    }
  }

  const beginTextInputMoveThreshold = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !selectedText) return
      const sx = e.clientX
      const sy = e.clientY
      const threshold2 = WATERMARK_TEXT_MOVE_THRESHOLD_PX * WATERMARK_TEXT_MOVE_THRESHOLD_PX
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        if (dx * dx + dy * dy > threshold2) {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          textInputRef.current?.blur()
          startTextDragAt(ev.clientX, ev.clientY, 'move', selectedText)
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [selectedText]
  )

  const beginCollapsedTextInteraction = useCallback((e: React.PointerEvent, item: WatermarkTextRecord) => {
    if (e.button !== 0) return
    if (activeTool !== 'text') {
      activateTool('text')
      setIsToolsOpen(true)
    }
    setSelectedTextId(item.id)
    const sx = e.clientX
    const sy = e.clientY
    let dragged = false
    const threshold2 = WATERMARK_TEXT_MOVE_THRESHOLD_PX * WATERMARK_TEXT_MOVE_THRESHOLD_PX
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (dx * dx + dy * dy > threshold2) {
        dragged = true
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        startTextDragAt(ev.clientX, ev.clientY, 'move', item)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!dragged) setWatermarkTextFrameOpen(true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [activeTool, activateTool])

  const onShapesToolRequested = useCallback(() => {
    activateTool('shapes')
    setIsToolsOpen(true)
  }, [activateTool])

  const onTextOverlayPointerDown = useCallback((e: React.PointerEvent, item: WatermarkTextRecord) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('button.watermark-crop-handle') || el.closest('.watermark-text-resize-handle')) return
    if (el.closest('.watermark-text-rotate-handle')) return
    if (el.closest('.watermark-text-overlay-textarea')) return
    startTextDragAt(e.clientX, e.clientY, 'move', item)
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const displayRect = useMemo(() => {
    if (!watermarkRect || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return null
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    return {
      left: watermarkRect.x * scaleX,
      top: watermarkRect.y * scaleY,
      width: watermarkRect.width * scaleX,
      height: watermarkRect.height * scaleY
    }
  }, [baseImageSize, stageSize.height, stageSize.width, watermarkRect])

  const textItemsRenderOrder = useMemo(() => {
    const openId = selectedTextId && watermarkTextFrameOpen ? selectedTextId : null
    if (!openId) return textItems
    return [...textItems].sort((a, b) => {
      if (a.id === openId) return 1
      if (b.id === openId) return -1
      return 0
    })
  }, [textItems, selectedTextId, watermarkTextFrameOpen])

  const collapsedTextPreviewUrls = useMemo(() => {
    const m = new Map<string, string>()
    if (!baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return m
    const previewScale = Math.min(stageSize.width / baseImageSize.width, stageSize.height / baseImageSize.height)
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    for (const item of textItems) {
      if (item.id === selectedTextId && watermarkTextFrameOpen) continue
      const cr = getWatermarkTextContentRectInImage(item)
      const relW = cr.width * scaleX
      const relH = cr.height * scaleY
      try {
        const url = renderWatermarkTextLayerDataUrl(item.content, relW, relH, {
          ...item.style,
          fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, item.style.fontSizePx * previewScale)
        })
        m.set(item.id, url)
      } catch {
        // skip
      }
    }
    return m
  }, [baseImageSize, stageSize.height, stageSize.width, textItems, selectedTextId, watermarkTextFrameOpen])

  const displayTextRect = useMemo(() => {
    if (!selectedText || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return null
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    return {
      left: selectedText.x * scaleX,
      top: selectedText.y * scaleY,
      width: selectedText.width * scaleX,
      height: selectedText.height * scaleY
    }
  }, [baseImageSize, stageSize.height, stageSize.width, selectedText])

  const liveTextContentRectInImage = useMemo(() => {
    if (!selectedText || !watermarkTextFrameOpen) return null
    return getLiveTextContentRectInImage(selectedText)
  }, [getLiveTextContentRectInImage, selectedText, watermarkTextFrameOpen, displayTextRect, stageSize.width, stageSize.height])

  const exportMain = useCallback(async (): Promise<void> => {
    await runWatermarkExport({
      watermarkExportInFlightRef,
      blurPreviewSourceRef,
      baseImagePath,
      watermarkImagePath,
      watermarkRect,
      baseIsVideo,
      baseImageSize,
      videoDurationSec,
      clipStartSec,
      clipEndSec,
      activeTool,
      selectionRect,
      selectionShape,
      blurStrength,
      blurFeather,
      focusSeparation,
      watermarkOpacity,
      textItems,
      shapeItems,
      selectedTextId,
      liveTextContentRectInImage,
      previewBaseImageDataUrl: baseImagePixelsFromBake ? baseImageSrc : null,
      setEditorError,
      setExportMsg,
      setIsExporting,
      setExportOverlay
    })
  }, [
    activeTool,
    baseImagePath,
    baseImagePixelsFromBake,
    baseImageSize,
    baseImageSrc,
    baseIsVideo,
    blurFeather,
    blurStrength,
    blurPreviewSourceRef,
    clipEndSec,
    clipStartSec,
    focusSeparation,
    liveTextContentRectInImage,
    selectedTextId,
    selectionRect,
    selectionShape,
    shapeItems,
    textItems,
    videoDurationSec,
    watermarkImagePath,
    watermarkOpacity,
    watermarkRect
  ])

  const displayTextContentRect = useMemo(() => {
    if (!displayTextRect || !selectedText) return null
    if (liveTextContentRectInImage && baseImageSize && stageSize.width > 0 && stageSize.height > 0) {
      const scaleX = stageSize.width / baseImageSize.width
      const scaleY = stageSize.height / baseImageSize.height
      return {
        x: liveTextContentRectInImage.x * scaleX - displayTextRect.left,
        y: liveTextContentRectInImage.y * scaleY - displayTextRect.top,
        width: liveTextContentRectInImage.width * scaleX,
        height: liveTextContentRectInImage.height * scaleY
      }
    }
    return getWatermarkTextContentRectInImage({
      x: 0,
      y: 0,
      width: displayTextRect.width,
      height: displayTextRect.height
    })
  }, [baseImageSize, displayTextRect, liveTextContentRectInImage, selectedText, stageSize.height, stageSize.width])

  const previewTextLayerDataUrl = useMemo(() => {
    if (!displayTextRect || !displayTextContentRect || !selectedText || !baseImageSize || !watermarkTextFrameOpen) return ''
    try {
      const previewScale = Math.min(stageSize.width / baseImageSize.width, stageSize.height / baseImageSize.height)
      return renderWatermarkTextLayerDataUrl(
        selectedText.content,
        displayTextContentRect.width,
        displayTextContentRect.height,
        {
          ...selectedText.style,
          fontSizePx: Math.max(WATERMARK_TEXT_FONT_SIZE_MIN, selectedText.style.fontSizePx * previewScale)
        }
      )
    } catch {
      return ''
    }
  }, [baseImageSize, displayTextContentRect, displayTextRect, selectedText, stageSize.height, stageSize.width, watermarkTextFrameOpen])

  const selectedShape = useMemo(
    () => shapeItems.find((s) => s.id === selectedShapeId) ?? null,
    [shapeItems, selectedShapeId]
  )

  const displaySelectionRect = useMemo(() => {
    if (!selectionRect || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return null
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    return {
      left: selectionRect.x * scaleX,
      top: selectionRect.y * scaleY,
      width: selectionRect.width * scaleX,
      height: selectionRect.height * scaleY
    }
  }, [baseImageSize, selectionRect, stageSize.height, stageSize.width])

  const circleFeatherPreviewGeometry = useMemo(
    () => buildCircleFeatherPreviewGeometry(activeTool, selectionShape, displaySelectionRect, blurFeatherPreviewPx),
    [activeTool, blurFeatherPreviewPx, displaySelectionRect, selectionShape]
  )

  const rectFeatherPreviewGeometry = useMemo(
    () => buildRectFeatherPreviewGeometry(activeTool, selectionShape, displaySelectionRect, blurFeatherPreviewPx),
    [activeTool, blurFeatherPreviewPx, displaySelectionRect, selectionShape]
  )

  const circleFeatherOuterStyle = useMemo(
    () => circleFeatherOuterCss(circleFeatherPreviewGeometry),
    [circleFeatherPreviewGeometry]
  )

  const rectFeatherBandStyle = useMemo(() => rectFeatherBandCss(rectFeatherPreviewGeometry), [rectFeatherPreviewGeometry])

  const rectFeatherOuterStyle = useMemo(() => rectFeatherOuterCss(rectFeatherPreviewGeometry), [rectFeatherPreviewGeometry])

  const selectionOverlayStyle = useMemo(
    () => selectionOverlayCss(displaySelectionRect, activeTool, selectionShape),
    [activeTool, displaySelectionRect, selectionShape]
  )

  const innerSelectionBorderStyle = useMemo(
    () => innerSelectionBorderCss(displaySelectionRect, activeTool, selectionShape),
    [activeTool, displaySelectionRect, selectionShape]
  )

  const toolSummary = useMemo(
    () => getWatermarkToolSummary(baseIsVideo, activeTool, selectionShape),
    [activeTool, baseIsVideo, selectionShape]
  )

  const usesExactBlurPreview = activeTool === 'blur' && !!processedPreviewSrc
  const previewImageSrc = usesExactBlurPreview ? processedPreviewSrc : baseImageSrc
  const showWatermarkStage = !!(previewImageSrc || baseVideoUrl)
  const exportDisabled =
    !baseImagePath ||
    !watermarkImagePath ||
    !watermarkRect ||
    isExporting ||
    (baseIsVideo && (videoDurationSec <= 0 || clipEndSec <= clipStartSec))

  const onWatermarkStagePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (activeTool !== 'text') return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('.watermark-text-layer-root')) return
      setSelectedTextId(null)
      setWatermarkTextFrameOpen(false)
    },
    [activeTool]
  )

  const textStackIndex = useMemo(
    () => (selectedTextId ? layerIndexInStack(layerOrder, 'text', selectedTextId) : -1),
    [layerOrder, selectedTextId]
  )
  const shapeStackIndex = useMemo(
    () => (selectedShapeId ? layerIndexInStack(layerOrder, 'shape', selectedShapeId) : -1),
    [layerOrder, selectedShapeId]
  )
  const canTextStackForward = textStackIndex >= 0 && textStackIndex < layerOrder.length - 1
  const canTextStackBackward = textStackIndex > 0
  const canShapeStackForward = shapeStackIndex >= 0 && shapeStackIndex < layerOrder.length - 1
  const canShapeStackBackward = shapeStackIndex > 0

  const moveTextLayerForward = useCallback(() => {
    if (!selectedTextId) return
    setLayerOrder((o) => moveLayerForward(o, 'text', selectedTextId))
  }, [selectedTextId])

  const moveTextLayerBackward = useCallback(() => {
    if (!selectedTextId) return
    setLayerOrder((o) => moveLayerBackward(o, 'text', selectedTextId))
  }, [selectedTextId])

  const moveShapeLayerForward = useCallback(() => {
    if (!selectedShapeId) return
    setLayerOrder((o) => moveLayerForward(o, 'shape', selectedShapeId))
  }, [selectedShapeId])

  const moveShapeLayerBackward = useCallback(() => {
    if (!selectedShapeId) return
    setLayerOrder((o) => moveLayerBackward(o, 'shape', selectedShapeId))
  }, [selectedShapeId])

  return (
    <div className="watermark-editor-tab">
      <WatermarkEditorIntro editorError={editorError} exportMsg={exportMsg} sessionSaveMsg={sessionSaveMsg} />

      <div className="watermark-workspace">
        <WatermarkEditorSidePanel
          pickBaseMedia={pickBaseMedia}
          pickWatermarkImage={pickWatermarkImage}
          resetWatermarkToDefault={resetWatermarkToDefault}
          isCustomWatermark={isCustomWatermark}
          watermarkImageSrc={watermarkImageSrc}
          isToolsOpen={isToolsOpen}
          setIsToolsOpen={setIsToolsOpen}
          baseImageSrc={baseImageSrc}
          baseVideoUrl={baseVideoUrl}
          activeTool={activeTool}
          activateTool={activateTool}
          setActiveTool={setActiveTool}
          selectionShape={selectionShape}
          setSelectionShape={setSelectionShape}
          baseIsVideo={baseIsVideo}
          blurStrength={blurStrength}
          setBlurStrength={setBlurStrength}
          blurFeather={blurFeather}
          setBlurFeather={setBlurFeather}
          focusSeparation={focusSeparation}
          setFocusSeparation={setFocusSeparation}
          blurSliderInteractionProps={blurSliderInteractionProps}
          exportMain={exportMain}
          exportDisabled={exportDisabled}
          isExporting={isExporting}
          resetEditor={resetEditor}
          watermarkOpacity={watermarkOpacity}
          setWatermarkOpacity={setWatermarkOpacity}
          defaultWatermarkAssetUrl={defaultWatermarkAssetUrl}
          baseImagePath={baseImagePath}
          watermarkImagePath={watermarkImagePath}
          videoDurationSec={videoDurationSec}
          toolSummary={toolSummary}
          isSelectionToolActive={isSelectionToolActive}
          onSaveSession={handleSaveSession}
          saveSessionDisabled={
            !baseImagePath || (!baseImageSrc && !baseVideoUrl) || isSavingSession || isDiscardingSession
          }
          hasUnsavedSessionChanges={hasUnsavedSessionChanges}
          onDiscardSessionChanges={handleDiscardSessionChanges}
          discardSessionDisabled={
            !baseImagePath || (!baseImageSrc && !baseVideoUrl) || isSavingSession || isDiscardingSession
          }
        />

        <WatermarkEditorPreviewCard
          showWatermarkStage={showWatermarkStage}
          baseVideoUrl={baseVideoUrl}
          baseVideoRef={baseVideoRef}
          baseImgRef={baseImgRef}
          previewImageSrc={previewImageSrc}
          stageMediaWrapRef={stageMediaWrapRef}
          onWatermarkStagePointerDownCapture={onWatermarkStagePointerDownCapture}
          onBaseVideoMetadata={onBaseVideoMetadata}
          updateStageSize={updateStageSize}
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
          selectedShape={selectedShape}
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
          setSelectedTextId={setSelectedTextId}
          setWatermarkTextFrameOpen={setWatermarkTextFrameOpen}
          textItems={textItems}
          videoDurationSec={videoDurationSec}
          clipStartSec={clipStartSec}
          clipEndSec={clipEndSec}
          onClipRangeChange={onClipRangeChange}
          layerOrder={layerOrder}
          moveTextLayerForward={moveTextLayerForward}
          moveTextLayerBackward={moveTextLayerBackward}
          moveShapeLayerForward={moveShapeLayerForward}
          moveShapeLayerBackward={moveShapeLayerBackward}
          canTextStackForward={canTextStackForward}
          canTextStackBackward={canTextStackBackward}
          canShapeStackForward={canShapeStackForward}
          canShapeStackBackward={canShapeStackBackward}
          onShapesToolRequested={onShapesToolRequested}
        />
                      </div>
      <WatermarkExportOverlay exportOverlay={exportOverlay} />
    </div>
  )
}
