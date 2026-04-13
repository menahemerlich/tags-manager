import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes
} from 'react'
import { type WatermarkShapeRecord } from './watermarkShapeModel'
import { useWatermarkBlurPreview } from './useWatermarkBlurPreview'
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
import { useWatermarkSessionActions, type WatermarkSavedMediaState } from './editorTab/useWatermarkSessionActions'
import { useWatermarkDragStarters } from './editorTab/useWatermarkDragStarters'
import { useWatermarkTextPointerInteractions } from './editorTab/useWatermarkTextPointerInteractions'
import { useEndDrag } from './editorTab/drag/useEndDrag'
import { useGlobalDragListeners } from './editorTab/drag/useGlobalDragListeners'
import { useSelectionRectDragMouseMove } from './editorTab/drag/useSelectionRectDragMouseMove'
import { useTextDragMouseMove } from './editorTab/drag/useTextDragMouseMove'
import { useTextDragStarters } from './editorTab/drag/useTextDragStarters'
import { useWatermarkRectDragMouseMove } from './editorTab/drag/useWatermarkRectDragMouseMove'
import { useBaseVideoMetadata } from './editorTab/media/useBaseVideoMetadata'
import { useStageSizeMeasurement } from './editorTab/media/useStageSizeMeasurement'
import { useWatermarkBaseIsVideo } from './editorTab/media/useWatermarkBaseIsVideo'
import { useLiveTextContentRectInImage } from './editorTab/text/useLiveTextContentRectInImage'
import { useWatermarkTextDisplay } from './editorTab/text/useWatermarkTextDisplay'
import { useWatermarkExportMain } from './editorTab/useWatermarkExportMain'
import { useWatermarkBlurState } from './editorTab/blur/useWatermarkBlurState'
import { useWatermarkToolActivation } from './editorTab/tools/useWatermarkToolActivation'
import { useBlurFeatherPreviewStyles } from './editorTab/display/useBlurFeatherPreviewStyles'
import { useSelectionDisplayRect } from './editorTab/display/useSelectionDisplayRect'
import { useWatermarkDisplayRect } from './editorTab/display/useWatermarkDisplayRect'
import { useWatermarkExportDisabled } from './editorTab/display/useWatermarkExportDisabled'
import { useWatermarkPreviewSource } from './editorTab/display/useWatermarkPreviewSource'
import { useWatermarkToolFlags } from './editorTab/display/useWatermarkToolFlags'
import { useWatermarkLayerStackControls } from './editorTab/layers/useWatermarkLayerStackControls'
import { useWatermarkSelectedItems } from './editorTab/selection/useWatermarkSelectedItems'
import { useInitialVideoSessionBaselineCapture } from './editorTab/session/useInitialVideoSessionBaselineCapture'
import type { WatermarkInitialSessionBaseline } from './editorTab/session/watermarkSessionMedia'
import { useWatermarkSessionSnapshot } from './editorTab/session/useWatermarkSessionSnapshot'
import { useWatermarkStagePointerDownCapture } from './editorTab/stage/useWatermarkStagePointerDownCapture'
import { useWatermarkEditorRefs } from './editorTab/refs/useWatermarkEditorRefs'
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
  /** URL ברירת מחדל של נכס סימן מים מובנה (אייקון). */
  const defaultWatermarkAssetUrl = useMemo(() => new URL('./icon.png', window.location.href).toString(), [])
  /** נתיב המדיה הבסיסית (קובץ תמונה/וידאו). */
  const [baseImagePath, setBaseImagePath] = useState<string | null>(null)
  /** מקור תצוגה לבסיס (data URL/URL מקומי לתמונה). */
  const [baseImageSrc, setBaseImageSrc] = useState<string | null>(null)
  /** מידות המדיה הבסיסית בפיקסלים. */
  const [baseImageSize, setBaseImageSize] = useState<{ width: number; height: number } | null>(null)
  /** URL מקומי לוידאו בסיסי (אם המדיה היא וידאו). */
  const [baseVideoUrl, setBaseVideoUrl] = useState<string | null>(null)
  /** משך הוידאו הבסיסי בשניות. */
  const [videoDurationSec, setVideoDurationSec] = useState(0)
  /** זמן התחלה של קטע הייצוא (בוידאו). */
  const [clipStartSec, setClipStartSec] = useState(0)
  /** זמן סיום של קטע הייצוא (בוידאו). */
  const [clipEndSec, setClipEndSec] = useState(0)
  /** נתיב קובץ סימן מים (תמונה/asset). */
  const [watermarkImagePath, setWatermarkImagePath] = useState<string | null>(defaultWatermarkAssetUrl)
  /** מקור תצוגה לסימן מים (URL לתמונה). */
  const [watermarkImageSrc, setWatermarkImageSrc] = useState<string | null>(defaultWatermarkAssetUrl)
  /** יחס־ממדים של סימן מים ברירת מחדל (נכס מובנה). */
  const [defaultWatermarkAspectRatio, setDefaultWatermarkAspectRatio] = useState(1)
  /** יחס־ממדים פעיל של סימן המים שנבחר. */
  const [watermarkAspectRatio, setWatermarkAspectRatio] = useState(1)
  /** מלבן סימן מים ביחידות מדיה (פיקסלים). */
  const [watermarkRect, setWatermarkRect] = useState<WatermarkSelectionRect | null>(null)
  /** מלבן בחירה (crop/blur) ביחידות מדיה. */
  const [selectionRect, setSelectionRect] = useState<WatermarkSelectionRect | null>(null)
  /** מצב הכלי הפעיל (ללא/טקסט/צורות/חיתוך/טשטוש וכו׳). */
  const [activeTool, setActiveTool] = useState<WatermarkToolMode>('none')
  /** האם פאנל הכלים הצדדי פתוח. */
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  /** רשימת שכבות טקסט. */
  const [textItems, setTextItems] = useState<WatermarkTextRecord[]>([])
  /** מזהה טקסט נבחר (או null). */
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  /** רשימת שכבות צורות. */
  const [shapeItems, setShapeItems] = useState<WatermarkShapeRecord[]>([])
  /** מזהה צורה נבחרת (או null). */
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  /** When false, only the exported content rect is shown (WYSIWYG); expanded shows handles + textarea. */
  const [watermarkTextFrameOpen, setWatermarkTextFrameOpen] = useState(false)
  /** צורת בחירה לכלי crop/blur. */
  const [selectionShape, setSelectionShape] = useState<WatermarkSelectionShape>('rect')
  /** עוצמת טשטוש (blur). */
  const [blurStrength, setBlurStrength] = useState(14)
  /** רוחב feather לטשטוש. */
  const [blurFeather, setBlurFeather] = useState(24)
  /** מרחק separation לאפקט פוקוס (אם קיים). */
  const [focusSeparation, setFocusSeparation] = useState(45)
  /** שקיפות סימן המים (0–1). */
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.35)
  /** גודל הבמה ב־DOM. */
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  /** האם מתבצע כרגע ייצוא. */
  const [isExporting, setIsExporting] = useState(false)
  /** מצב overlay של ייצוא (progress). */
  const [exportOverlay, setExportOverlay] = useState<WatermarkExportOverlayState>(null)
  /** הודעת סטטוס/שגיאה עבור ייצוא. */
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  /** שגיאת עורך כללית. */
  const [editorError, setEditorError] = useState<string | null>(null)
  /** snapshot של הסשן שנשמר לאחרונה (לזיהוי “שינויים לא שמורים”). */
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
  const initialSessionBaselineRef = useRef<WatermarkInitialSessionBaseline | null>(null)
  /** נתיב שכבר צולם לו baseline ראשוני (מונע כפילות במטא־דאטה של וידאו). */
  const initialBaselineCapturedForPathRef = useRef<string | null>(null)
  /** הודעת “נשמר” עבור שמירת סשן. */
  const [sessionSaveMsg, setSessionSaveMsg] = useState<string | null>(null)
  /** האם רץ כרגע תהליך “ביטול שינויים” לסשן. */
  const [isDiscardingSession, setIsDiscardingSession] = useState(false)
  /** הבסיס במסך מגיע מ־data URL (אחרי שמירת חיתוך/טשטוש) — הייצוא חייב לשלוח פיקסלים ולא לקרוא שוב מהקובץ המקורי. */
  const [baseImagePixelsFromBake, setBaseImagePixelsFromBake] = useState(false)
  /** האם רצה כרגע שמירת סשן. */
  const [isSavingSession, setIsSavingSession] = useState(false)
  /** סדר שכבות משולב (טקסט + צורות) לצורך שליטה בערימה. */
  const [layerOrder, setLayerOrder] = useState<WatermarkLayerEntry[]>([])

  useEffect(() => {
    setLayerOrder((prev) => mergeLayerEntries(prev, shapeItems, textItems))
  }, [shapeItems, textItems])

  const { selectedShape, selectedText } = useWatermarkSelectedItems({
    textItems,
    selectedTextId,
    setSelectedTextId: (fn) => setSelectedTextId(fn),
    shapeItems,
    selectedShapeId,
    setSelectedShapeId: (fn) => setSelectedShapeId(fn)
  })

  const { currentSessionSnapshot, hasUnsavedSessionChanges } = useWatermarkSessionSnapshot({
    baseImagePath,
    savedSessionSnapshot,
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

  const { isCustomWatermark, isSelectionToolActive } = useWatermarkToolFlags({
    watermarkImagePath,
    defaultWatermarkAssetUrl,
    activeTool
  })
  /** refs מרכזיים של העורך (מדיה/drag/export-in-flight). */
  const {
    baseImgRef,
    baseVideoRef,
    stageMediaWrapRef,
    textInputRef,
    dragStateRef,
    selectionDragStateRef,
    textDragStateRef,
    watermarkExportInFlightRef
  } = useWatermarkEditorRefs()
  /** האם המדיה הבסיסית היא וידאו לפי סיומת. */
  const baseIsVideo = useWatermarkBaseIsVideo({ baseImagePath })

  useInitialVideoSessionBaselineCapture({
    baseImagePath,
    baseIsVideo,
    baseImageSize,
    baseVideoUrl,
    videoDurationSec,
    initialBaselineCapturedForPathRef,
    initialSessionBaselineRef,
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

  const { updateStageSize } = useStageSizeMeasurement({
    stageMediaWrapRef,
    baseVideoRef,
    baseImgRef,
    setStageSize
  })

  const onClipRangeChange = useCallback((start: number, end: number) => {
    setClipStartSec(start)
    setClipEndSec(end)
  }, [])

  const { getLiveTextContentRectInImage } = useLiveTextContentRectInImage({ baseImageSize, stageMediaWrapRef, textInputRef })

  const { onBaseVideoMetadata } = useBaseVideoMetadata({
    baseVideoRef,
    watermarkImageSrc,
    watermarkAspectRatio,
    setBaseImageSize,
    setVideoDurationSec,
    setClipStartSec,
    setClipEndSec,
    setWatermarkRect
  })

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

  const { blurFeatherPreviewPx, blurParams, blurSelection } = useWatermarkBlurState({
    selectionRect,
    selectionShape,
    baseImageSize,
    stageSize,
    blurFeather,
    blurStrength,
    focusSeparation
  })

  const {
    processedPreviewSrc,
    blurPreviewSourceRef,
    resetBlurPreview,
    softInvalidateBlurSource
  } = useWatermarkBlurPreview({ activeTool, baseImageSrc, blurSelection, blurParams })

  const { activateTool, ensureSelectionRect } = useWatermarkToolActivation({
    baseImagePath,
    baseImageSize,
    setEditorError,
    setActiveTool,
    setWatermarkTextFrameOpen,
    setSelectionRect
  })

  const blurSliderInteractionProps: InputHTMLAttributes<HTMLInputElement> = {}

  /** כתיבה למצב מדיה שמור אחרון (ref). */
  const setLastSavedSessionMedia = useCallback((v: WatermarkSavedMediaState | null) => {
    lastSavedSessionMediaRef.current = v
  }, [])

  /** קריאה למצב מדיה שמור אחרון (ref) — לשחזור מדויק אחרי ביטול. */
  const getLastSavedSessionMedia = useCallback((): WatermarkSavedMediaState | null => lastSavedSessionMediaRef.current, [])

  /** כתיבה ל־baseline ראשוני של הסשן (ref). */
  const setInitialSessionBaseline = useCallback(
    (v: { snapshot: WatermarkEditorSnapshot; media: WatermarkSavedMediaState } | null) => {
      initialSessionBaselineRef.current = v
    },
    []
  )

  /** כתיבה לנתיב שכבר צולם לו baseline (ref). */
  const setInitialBaselineCapturedForPath = useCallback((v: string | null) => {
    initialBaselineCapturedForPathRef.current = v
  }, [])

  /** קריאה ל־baseline ראשוני (לשחזור אחרי שמירה). */
  const getInitialSessionBaseline = useCallback(() => initialSessionBaselineRef.current, [])

  const { applyBaseMediaPath, handleSaveSession, handleDiscardSessionChanges } = useWatermarkSessionActions({
    api: window.api,
    baseIsVideo,
    baseImagePath,
    baseImageSrc,
    baseImageSize,
    baseImagePixelsFromBake,
    baseVideoUrl,
    videoDurationSec,
    clipStartSec,
    clipEndSec,
    activeTool,
    selectionRect,
    selectionShape,
    blurStrength,
    blurFeather,
    focusSeparation,
    watermarkRect,
    watermarkOpacity,
    watermarkAspectRatio,
    watermarkImagePath,
    watermarkImageSrc,
    textItems,
    shapeItems,
    layerOrder,
    savedSessionSnapshot,
    hasUnsavedSessionChanges,
    defaultWatermarkAssetUrl,
    setEditorError,
    setExportMsg,
    setSessionSaveMsg,
    setIsSavingSession,
    setIsDiscardingSession,
    setBaseImagePath,
    setBaseImageSrc,
    setBaseImageSize,
    setBaseVideoUrl,
    setVideoDurationSec,
    setClipStartSec,
    setClipEndSec,
    setBaseImagePixelsFromBake,
    setSelectionRect,
    setSelectionShape,
    setBlurStrength,
    setBlurFeather,
    setFocusSeparation,
    setLayerOrder,
    setWatermarkRect,
    setWatermarkOpacity,
    setWatermarkAspectRatio,
    setWatermarkImagePath,
    setWatermarkImageSrc,
    setTextItems,
    setShapeItems,
    setSelectedTextId: (fn) => setSelectedTextId(fn),
    setSelectedShapeId: (fn) => setSelectedShapeId(fn),
    setSavedSessionSnapshot,
    setActiveTool,
    setWatermarkTextFrameOpen,
    resetBlurPreview,
    softInvalidateBlurSource,
    setLastSavedSessionMedia,
    getLastSavedSessionMedia,
    setInitialSessionBaseline,
    setInitialBaselineCapturedForPath,
    getInitialSessionBaseline
  })

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

  const { endDrag } = useEndDrag({ dragStateRef, selectionDragStateRef, textDragStateRef })

  const { handleGlobalTextMouseMove } = useTextDragMouseMove({
    textDragStateRef,
    baseImageSize,
    stageSize,
    currentWatermarkBounds,
    setTextItems
  })

  const { handleGlobalMouseMove } = useWatermarkRectDragMouseMove({
    dragStateRef,
    baseImageSize,
    stageSize,
    currentWatermarkBounds,
    watermarkAspectRatio,
    watermarkRect,
    setWatermarkRect
  })

  const { handleGlobalSelectionMouseMove } = useSelectionRectDragMouseMove({
    selectionDragStateRef,
    baseImageSize,
    stageSize,
    selectionRect,
    activeTool,
    setSelectionRect,
    setWatermarkRect
  })

  useGlobalDragListeners({
    endDrag,
    onMouseMoveHandlers: [handleGlobalMouseMove, handleGlobalSelectionMouseMove, handleGlobalTextMouseMove]
  })

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

  const { startWatermarkDrag, startSelectionDrag } = useWatermarkDragStarters({
    watermarkRect,
    selectionRect,
    dragStateRef,
    selectionDragStateRef
  })

  /** פותח את פאנל הכלים בצד (כשנדרש אינטראקציה מתוך הבמה). */
  const openToolsPanel = useCallback(() => setIsToolsOpen(true), [])

  const {
    startTextDragAt,
    beginTextInputMoveThreshold,
    beginCollapsedTextInteraction,
    onTextOverlayPointerDown
  } = useWatermarkTextPointerInteractions({
    activeTool,
    activateTool,
    openToolsPanel,
    setWatermarkTextFrameOpen,
    setSelectedTextId,
    selectedText,
    textInputRef,
    textDragStateRef
  })

  /** מלבן המדיה על המסך (DOM) לצורך חישובי pivot בסיבוב טקסט. */
  const stageMediaWrapRect = useMemo(() => stageMediaWrapRef.current?.getBoundingClientRect() ?? null, [stageSize.width, stageSize.height])

  const { startTextDrag, startTextRotateDrag } = useTextDragStarters({
    textDragStateRef,
    stageMediaWrapRect,
    baseImageSize,
    stageSize
  })

  const onShapesToolRequested = useCallback(() => {
    activateTool('shapes')
    setIsToolsOpen(true)
  }, [activateTool])

  /** מלבן סימן מים ביחידות DOM לצורך רינדור והנדלים. */
  const displayRect = useWatermarkDisplayRect({ watermarkRect, baseImageSize, stageSize })

  const liveTextContentRectInImage = useMemo(() => {
    if (!selectedText || !watermarkTextFrameOpen) return null
    return getLiveTextContentRectInImage(selectedText)
  }, [getLiveTextContentRectInImage, selectedText, watermarkTextFrameOpen])

  const { exportMain } = useWatermarkExportMain({
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

  const { collapsedTextPreviewUrls, displayTextContentRect, displayTextRect, previewTextLayerDataUrl, textItemsRenderOrder } =
    useWatermarkTextDisplay({
      baseImageSize,
      stageSize,
      textItems,
      selectedTextId,
      watermarkTextFrameOpen,
      selectedText,
      liveTextContentRectInImage
    })

  /** מלבן בחירה (crop/blur) ביחידות DOM לתצוגה והנדלים. */
  const displaySelectionRect = useSelectionDisplayRect({ selectionRect, baseImageSize, stageSize })

  const { circleFeatherOuterStyle, innerSelectionBorderStyle, rectFeatherBandStyle, rectFeatherOuterStyle, selectionOverlayStyle } =
    useBlurFeatherPreviewStyles({
      activeTool,
      selectionShape,
      displaySelectionRect,
      blurFeatherPreviewPx
    })

  const toolSummary = useMemo(
    () => getWatermarkToolSummary(baseIsVideo, activeTool, selectionShape),
    [activeTool, baseIsVideo, selectionShape]
  )

  const { previewImageSrc, showWatermarkStage } = useWatermarkPreviewSource({
    activeTool,
    processedPreviewSrc,
    baseImageSrc,
    baseVideoUrl
  })

  /** מונע ייצוא כשאין נתוני בסיס/כשיש ייצוא פעיל/וכשקטע וידאו לא תקין. */
  const exportDisabled = useWatermarkExportDisabled({
    baseImagePath,
    watermarkImagePath,
    watermarkRect,
    isExporting,
    baseIsVideo,
    videoDurationSec,
    clipStartSec,
    clipEndSec
  })

  const { onWatermarkStagePointerDownCapture } = useWatermarkStagePointerDownCapture({
    activeTool,
    setSelectedTextId,
    setWatermarkTextFrameOpen
  })

  const {
    canTextStackForward,
    canTextStackBackward,
    canShapeStackForward,
    canShapeStackBackward,
    moveTextLayerForward,
    moveTextLayerBackward,
    moveShapeLayerForward,
    moveShapeLayerBackward
  } = useWatermarkLayerStackControls({
    layerOrder,
    selectedTextId,
    selectedShapeId,
    setLayerOrder
  })

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
          startDrag={startWatermarkDrag}
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
