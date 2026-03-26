import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type {
  BlurParams,
  BlurSelection,
  FaceDetection,
  ImportConflictChoice,
  PathKind,
  SearchResultRow,
  SelectionShape,
  TransferPackageProgress,
  TagFolderRow,
  TagImportPreview,
  TagRow,
} from '../../shared/types'
import { FACE_EMBEDDING_MODEL_ID } from '../../shared/types'
import { normalizeTagName } from '../../shared/tagNormalize'
import {
  createBlurPreviewSource,
  createBlurredPreviewImageData,
  renderBlurPreviewDataUrl,
  type BlurPreviewSource
} from './blurProcessor'
import * as faceapi from 'face-api.js'
import '@tensorflow/tfjs-backend-cpu'
import SyncPage from './pages/Sync/SyncPage'
import UpdateSection from './pages/Settings/UpdateSection'
import { FilePreview } from './components/FilePreview'
import { TableVirtuoso } from 'react-virtuoso'

type Tab = 'library' | 'search' | 'tags' | 'settings' | 'cloud-sync'

type FaceTab = 'faces' | 'watermark'

type WatermarkToolMode = 'none' | 'crop' | 'blur' | 'text'
type WatermarkSelectionShape = SelectionShape
type WatermarkSelectionRect = { x: number; y: number; width: number; height: number }
type WatermarkSelectionHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type FolderAccentStyle = CSSProperties & {
  '--folder-accent'?: string
  '--folder-accent-rgb'?: string
  '--folder-text'?: string
}

const FOLDER_COLOR_PALETTE = [
  { accent: '#22d3ee', accentRgb: '34, 211, 238', text: '#ecfeff' },
  { accent: '#8b5cf6', accentRgb: '139, 92, 246', text: '#f3e8ff' },
  { accent: '#10b981', accentRgb: '16, 185, 129', text: '#d1fae5' },
  { accent: '#f59e0b', accentRgb: '245, 158, 11', text: '#fef3c7' },
  { accent: '#ef4444', accentRgb: '239, 68, 68', text: '#fee2e2' },
  { accent: '#6366f1', accentRgb: '99, 102, 241', text: '#e0e7ff' },
  { accent: '#ec4899', accentRgb: '236, 72, 153', text: '#fce7f3' },
  { accent: '#84cc16', accentRgb: '132, 204, 22', text: '#ecfccb' },
  { accent: '#f97316', accentRgb: '249, 115, 22', text: '#ffedd5' },
  { accent: '#14b8a6', accentRgb: '20, 184, 166', text: '#ccfbf1' }
] as const

function getFolderAccentStyle(folderId: number | null | undefined): FolderAccentStyle | undefined {
  if (folderId == null) return undefined
  const paletteEntry = FOLDER_COLOR_PALETTE[Math.abs(folderId) % FOLDER_COLOR_PALETTE.length]
  return {
    '--folder-accent': paletteEntry.accent,
    '--folder-accent-rgb': paletteEntry.accentRgb,
    '--folder-text': paletteEntry.text
  }
}

function kindHe(kind: PathKind): string {
  return kind === 'folder' ? 'תיקייה' : 'קובץ'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadImageDimensions(imageSrc: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('טעינת תמונה נכשלה'))
    img.src = imageSrc
  })
}

function isWatermarkVideoPath(filePath: string): boolean {
  const p = filePath.toLowerCase()
  return ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].some((ext) => p.endsWith(ext))
}

function formatWatermarkTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const sRem = sec % 60
  const wholeS = Math.floor(sRem)
  const frac = Math.round((sRem - wholeS) * 10)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const core = h > 0 ? `${h}:${pad2(m)}:${pad2(wholeS)}` : `${m}:${pad2(wholeS)}`
  if (frac <= 0) return core
  return `${core}.${frac}`
}

type WatermarkTextStyleState = {
  color: string
  fontFamily: string
  fontSizePx: number
  bold: boolean
  italic: boolean
}

const DEFAULT_WATERMARK_TEXT_STYLE: WatermarkTextStyleState = {
  color: '#ffffff',
  fontFamily: 'Segoe UI, Tahoma, Arial, sans-serif',
  fontSizePx: 28,
  bold: false,
  italic: false
}

const WATERMARK_TEXT_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Segoe UI', value: 'Segoe UI, Tahoma, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'David', value: 'David, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' }
]

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const raw = text.trim() || ' '
  const out: string[] = []
  for (const para of raw.split(/\n/)) {
    const words = para.trim() ? para.trim().split(/\s+/) : ['']
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width <= maxWidth) {
        line = test
      } else {
        if (line) {
          out.push(line)
          line = ''
        }
        if (ctx.measureText(word).width <= maxWidth) {
          line = word
        } else {
          let chunk = ''
          for (const ch of word) {
            const t2 = chunk + ch
            if (ctx.measureText(t2).width <= maxWidth) chunk = t2
            else {
              if (chunk) out.push(chunk)
              chunk = ch
            }
          }
          line = chunk
        }
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : [' ']
}

function renderWatermarkTextLayerDataUrl(
  text: string,
  width: number,
  height: number,
  style: WatermarkTextStyleState
): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const fontWeight = style.bold ? '700' : '400'
  const fontStyle = style.italic ? 'italic' : 'normal'
  ctx.font = `${fontStyle} ${fontWeight} ${style.fontSizePx}px ${style.fontFamily}`
  ctx.fillStyle = style.color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'right'
  ctx.direction = 'rtl'

  const padding = 10
  const maxW = Math.max(1, canvas.width - padding * 2)
  const lines = wrapCanvasLines(ctx, text, maxW)
  const lineHeight = style.fontSizePx * 1.3
  let y = padding
  for (const line of lines) {
    if (y + lineHeight > canvas.height - padding) break
    ctx.fillText(line, canvas.width - padding, y)
    y += lineHeight
  }
  return canvas.toDataURL('image/png')
}

const CLIP_HANDLE_MIN_GAP_SEC = 0.15

function VideoClipRangeBar(props: {
  durationSec: number
  startSec: number
  endSec: number
  onRangeChange: (start: number, end: number) => void
  videoRef: RefObject<HTMLVideoElement | null>
}) {
  const { durationSec, startSec, endSec, onRangeChange, videoRef } = props
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragKind = useRef<'start' | 'end' | null>(null)
  const rangeRef = useRef({ start: startSec, end: endSec })
  rangeRef.current = { start: startSec, end: endSec }

  const posToTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || durationSec <= 0) return 0
      const r = el.getBoundingClientRect()
      const ratio = clampNumber((clientX - r.left) / Math.max(1, r.width), 0, 1)
      return ratio * durationSec
    },
    [durationSec]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const kind = dragKind.current
      if (!kind) return
      const t = posToTime(e.clientX)
      const { start, end } = rangeRef.current
      const gap = CLIP_HANDLE_MIN_GAP_SEC
      if (kind === 'start') {
        const maxS = Math.max(0, end - gap)
        onRangeChange(Math.min(t, maxS), end)
      } else {
        const minE = Math.min(durationSec, start + gap)
        onRangeChange(start, Math.max(t, minE))
      }
    }
    const endDrag = () => {
      dragKind.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [durationSec, onRangeChange, posToTime])

  const pct = (sec: number) => (durationSec > 0 ? (sec / durationSec) * 100 : 0)

  return (
    <div className="watermark-clip-timeline">
      <p className="muted small watermark-clip-timeline-hint">
        גרור את הסימונים לתחילת וסוף הקטע לייצוא. לחיצה על הפס מקדימה את הנגן.
      </p>
      <div className="watermark-clip-timeline-times">
        <span className="watermark-clip-time-label">התחלה {formatWatermarkTimeSec(startSec)}</span>
        <span className="watermark-clip-time-label">סיום {formatWatermarkTimeSec(endSec)}</span>
      </div>
      <div
        ref={trackRef}
        className="watermark-clip-track"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.watermark-clip-handle')) return
          const t = posToTime(e.clientX)
          const v = videoRef.current
          if (v) v.currentTime = t
        }}
        role="presentation"
      >
        <div
          className="watermark-clip-selected"
          style={{ left: `${pct(startSec)}%`, width: `${pct(endSec - startSec)}%` }}
        />
        <button
          type="button"
          className="watermark-clip-handle watermark-clip-handle-start"
          aria-label="תחילת קטע לייצוא"
          style={{ left: `${pct(startSec)}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dragKind.current = 'start'
          }}
        />
        <button
          type="button"
          className="watermark-clip-handle watermark-clip-handle-end"
          aria-label="סוף קטע לייצוא"
          style={{ left: `${pct(endSec)}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dragKind.current = 'end'
          }}
        />
      </div>
    </div>
  )
}

type WatermarkExportOverlayState =
  | null
  | { kind: 'video'; percent: number; fileName: string }
  | { kind: 'image'; fileName: string }

export default function App() {
  const [tab, setTab] = useState<Tab | FaceTab>('library')
  const [librarySelectedItems, setLibrarySelectedItems] = useState<{ path: string; kind: PathKind }[] | null>(null)
  const [libraryTags, setLibraryTags] = useState<string[]>([])
  const [libraryTagDraft, setLibraryTagDraft] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [tagFolders, setTagFolders] = useState<TagFolderRow[]>([])
  const [newTagFolderName, setNewTagFolderName] = useState('')
  const [expandedTagFolderIds, setExpandedTagFolderIds] = useState<Record<number, boolean>>({})
  const [expandedLibraryFolderIds, setExpandedLibraryFolderIds] = useState<Record<number, boolean>>({})
  const [expandedSearchFolderIds, setExpandedSearchFolderIds] = useState<Record<number, boolean>>({})
  const [openTagFolderMenuId, setOpenTagFolderMenuId] = useState<number | null>(null)
  const [libraryTagFolderByName, setLibraryTagFolderByName] = useState<Record<string, number | null>>({})
  const [searchTagsModal, setSearchTagsModal] = useState<{ open: boolean; path: string; tags: string[] }>({
    open: false,
    path: '',
    tags: []
  })
  const [tagFolderPicker, setTagFolderPicker] = useState<{ open: boolean; tagName: string; selectedFolderId: string }>({
    open: false,
    tagName: '',
    selectedFolderId: ''
  })
  const [searchSelected, setSearchSelected] = useState<string[]>([])
  const [searchDraft, setSearchDraft] = useState('')
  const [searchScope, setSearchScope] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([])
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedSearchPath, setSelectedSearchPath] = useState<string | null>(null)
  const [selectedSearchDirectTags, setSelectedSearchDirectTags] = useState<string[]>([])
  const [searchFileTagDraft, setSearchFileTagDraft] = useState('')
  const [settingsView, setSettingsView] = useState<'updates' | 'io' | 'transfer' | 'about'>('updates')
  const [appVersion, setAppVersion] = useState('')
  const [transferMsg, setTransferMsg] = useState<string | null>(null)
  const [transferRevealPath, setTransferRevealPath] = useState<string | null>(null)
  const [isPackagingTransfer, setIsPackagingTransfer] = useState(false)
  const [isImportingUserData, setIsImportingUserData] = useState(false)
  const [transferBuildChoiceOpen, setTransferBuildChoiceOpen] = useState(false)
  const [transferProgress, setTransferProgress] = useState<TransferPackageProgress | null>(null)
  const [tagIoScopePath, setTagIoScopePath] = useState<string | null>(null)
  const [tagIoMsg, setTagIoMsg] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<TagImportPreview | null>(null)
  const [importDefaultChoice, setImportDefaultChoice] = useState<ImportConflictChoice>('skip')
  const [importChoicesByPath, setImportChoicesByPath] = useState<Record<string, ImportConflictChoice>>({})
  const [importApplying, setImportApplying] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [indexing, setIndexing] = useState<{ done: number; total: number; currentPath: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watermarkOpenFromPreview, setWatermarkOpenFromPreview] = useState<{ path: string; id: number } | null>(null)
  const [faceOpenFromPreview, setFaceOpenFromPreview] = useState<{ path: string; id: number } | null>(null)
  const tagFolderPickerResolverRef = useRef<((value: number | null | undefined) => void) | null>(null)

  const refreshTags = useCallback(async () => {
    const list = await window.api.listTags()
    setTags(list)
  }, [])

  const refreshTagFolders = useCallback(async () => {
    const list = await window.api.listTagFolders()
    setTagFolders(list)
  }, [])

  useEffect(() => {
    void refreshTags()
    void refreshTagFolders()
    void window.api.getAppVersion().then(setAppVersion)
  }, [refreshTagFolders, refreshTags])

  useEffect(() => {
    const off = window.api.onIndexProgress((p) => {
      setIndexing(p)
      if (p.total > 0 && p.done >= p.total) {
        setTimeout(() => setIndexing(null), 150)
      }
    })
    return off
  }, [])

  useEffect(() => {
    const off = window.api.onImportProgress((p) => {
      setImportProgress(p)
    })
    return off
  }, [])

  useEffect(() => {
    const off = window.api.onTransferPackageProgress((p) => {
      setTransferProgress(p)
    })
    return off
  }, [])

  const transferProgressPercent = useMemo(() => {
    if (!transferProgress) return 0
    switch (transferProgress.stage) {
      case 'idle':
        return 0
      case 'select-destination':
        return 5
      case 'validating':
        return 14
      case 'persisting-data':
        return 24
      case 'searching-installer':
        return 34
      case 'building':
        return 62
      case 'collecting-installer':
        return 78
      case 'copying-data':
        return 88
      case 'writing-instructions':
        return 95
      case 'done':
        return 100
      case 'error':
        return 100
      default:
        return 0
    }
  }, [transferProgress])

  useEffect(() => {
    if (openTagFolderMenuId === null) return

    const closeMenu = () => setOpenTagFolderMenuId(null)
    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [openTagFolderMenuId])

  function addLibraryTag(name: string) {
    const n = normalizeTagName(name)
    if (!n) return
    setLibraryTags((prev) => {
      if (prev.some((t) => t.toLowerCase() === n.toLowerCase())) return prev
      return [...prev, n].sort((a, b) => a.localeCompare(b))
    })
  }

  function removeLibraryTag(name: string) {
    setLibraryTags((prev) => prev.filter((t) => t !== name))
    setLibraryTagFolderByName((prev) => {
      const next = { ...prev }
      delete next[name.toLowerCase()]
      return next
    })
  }

  async function requestAddLibraryTag(name: string): Promise<void> {
    const n = normalizeTagName(name)
    if (!n) return
    if (libraryTags.some((t) => t.toLowerCase() === n.toLowerCase())) {
      setLibraryTagDraft('')
      return
    }
    const folderChoice = await promptTagFolderChoice(n, getFolderIdByTagName(n))
    if (folderChoice === undefined) return
    addLibraryTag(n)
    setLibraryTagFolderByName((prev) => ({ ...prev, [n.toLowerCase()]: folderChoice }))
    setLibraryTagDraft('')
  }

  const libraryFolderSuggestions = useMemo(() => {
    if (!librarySelectedItems?.length) return []
    const seen = new Set<string>()
    const suggestions: string[] = []
    for (const item of librarySelectedItems) {
      const parts = item.path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean)
      // הכללת כל שמות התיקיות מהשורש (לא כולל אות כונן)
      const folderParts = item.kind === 'file' && parts.length > 1 ? parts.slice(0, -1) : parts
      for (const name of folderParts) {
        const n = normalizeTagName(name)
        if (n && !/^[a-zA-Z]:$/.test(n) && !seen.has(n.toLowerCase())) {
          seen.add(n.toLowerCase())
          suggestions.push(n)
        }
      }
    }
    return suggestions.sort((a, b) => a.localeCompare(b))
  }, [librarySelectedItems])

  function handlePickFiles() {
    setError(null)
    void window.api.pickFiles().then(async (picked) => {
      if (!picked?.length) return
      setLibrarySelectedItems(picked)
      const allTags = new Set<string>()
      for (const item of picked) {
        const ts = await window.api.getTagsForPath(item.path)
        ts.forEach((t) => allTags.add(t))
      }
      const names = [...allTags].sort((a, b) => a.localeCompare(b))
      const folderMap: Record<string, number | null> = {}
      for (const name of names) folderMap[name.toLowerCase()] = getFolderIdByTagName(name)
      setLibraryTags(names)
      setLibraryTagFolderByName(folderMap)
    })
  }

  function handlePickFolders() {
    setError(null)
    void window.api.pickFolders().then(async (picked) => {
      if (!picked?.length) return
      setLibrarySelectedItems(picked)
      const allTags = new Set<string>()
      for (const item of picked) {
        const ts = await window.api.getTagsForPath(item.path)
        ts.forEach((t) => allTags.add(t))
      }
      const names = [...allTags].sort((a, b) => a.localeCompare(b))
      const folderMap: Record<string, number | null> = {}
      for (const name of names) folderMap[name.toLowerCase()] = getFolderIdByTagName(name)
      setLibraryTags(names)
      setLibraryTagFolderByName(folderMap)
    })
  }

  async function handleLibrarySaveAndDone() {
    if (!librarySelectedItems?.length) return
    setError(null)
    const hasFolders = librarySelectedItems.some((i) => i.kind === 'folder')
    if (hasFolders) setIndexing({ done: 0, total: 0, currentPath: 'מתחיל…' })
    try {
      const res = await window.api.addItems(librarySelectedItems, libraryTags)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setLibrarySelectedItems(null)
      setLibraryTags([])
      setLibraryTagFolderByName({})
      setLibraryTagDraft('')
      await refreshTags()
      for (const tagName of libraryTags) {
        const key = tagName.toLowerCase()
        if (!(key in libraryTagFolderByName)) continue
        await assignFolderByTagName(tagName, libraryTagFolderByName[key] ?? null)
      }
      await refreshTagFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIndexing(null)
    }
  }

  function handleLibraryCancel() {
    setLibrarySelectedItems(null)
    setLibraryTags([])
    setLibraryTagFolderByName({})
    setLibraryTagDraft('')
  }

  async function handlePickSearchScope() {
    const folder = await window.api.pickFolder()
    if (folder) setSearchScope(folder)
  }

  async function handleCancelIndex() {
    await window.api.cancelIndex()
  }

  const runSearch = useCallback(async () => {
    setError(null)
    setSearchLoading(true)
    try {
      const res = await window.api.search(searchSelected)
      setSearchResults(res.rows)
      setSearchTruncated(res.truncated ?? false)
    } finally {
      setSearchLoading(false)
    }
  }, [searchSelected])

  useEffect(() => {
    void runSearch()
  }, [runSearch, tags])

  useEffect(() => {
    const onUserDataReloaded = () => {
      void refreshTags()
      void refreshTagFolders()
      void runSearch()
    }
    window.addEventListener('tags-manager:user-data-reloaded', onUserDataReloaded)
    return () => window.removeEventListener('tags-manager:user-data-reloaded', onUserDataReloaded)
  }, [refreshTagFolders, refreshTags, runSearch])

  const searchResultsFiltered = useMemo(() => {
    if (!searchScope) return searchResults
    const base = searchScope.replace(/[/\\]+$/, '')
    const sep = searchScope.includes('\\') ? '\\' : '/'
    const prefix = base + sep
    return searchResults.filter((r) => r.path === base || r.path.startsWith(prefix))
  }, [searchResults, searchScope])

  function addToSearchQuery() {
    const n = normalizeTagName(searchDraft)
    if (!n) return
    setSearchSelected((prev) => {
      if (prev.some((t) => t.toLowerCase() === n.toLowerCase())) return prev
      return [...prev, n]
    })
    setSearchDraft('')
  }

  function removeSearchTag(name: string) {
    setSearchSelected((prev) => prev.filter((t) => t !== name))
  }

  const folderNameByTagId = useMemo(() => {
    const map = new Map<number, string>()
    for (const folder of tagFolders) {
      for (const tagId of folder.tagIds) map.set(tagId, folder.name)
    }
    return map
  }, [tagFolders])

  const folderIdByTagId = useMemo(() => {
    const map = new Map<number, number>()
    for (const folder of tagFolders) {
      for (const tagId of folder.tagIds) map.set(tagId, folder.id)
    }
    return map
  }, [tagFolders])

  const folderIdByTagNameLower = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const tag of tags) {
      map.set(tag.name.toLowerCase(), folderIdByTagId.get(tag.id) ?? null)
    }
    return map
  }, [folderIdByTagId, tags])

  function getTagIdByName(name: string): number | null {
    const n = normalizeTagName(name)
    if (!n) return null
    const hit = tags.find((t) => t.name.toLowerCase() === n.toLowerCase())
    return hit ? hit.id : null
  }

  function getFolderIdByTagName(name: string): number | null {
    const tagId = getTagIdByName(name)
    if (!tagId) return null
    return folderIdByTagId.get(tagId) ?? null
  }

  async function promptTagFolderChoice(tagName: string, initialFolderId: number | null): Promise<number | null | undefined> {
    return await new Promise<number | null | undefined>((resolve) => {
      tagFolderPickerResolverRef.current = resolve
      setTagFolderPicker({
        open: true,
        tagName,
        selectedFolderId: initialFolderId === null ? '' : String(initialFolderId)
      })
    })
  }

  function closeTagFolderPicker(nextValue: number | null | undefined): void {
    const resolve = tagFolderPickerResolverRef.current
    tagFolderPickerResolverRef.current = null
    setTagFolderPicker({ open: false, tagName: '', selectedFolderId: '' })
    resolve?.(nextValue)
  }

  async function assignFolderByTagName(tagName: string, folderId: number | null): Promise<void> {
    const latestTags = await window.api.listTags()
    const n = normalizeTagName(tagName)
    const tag = latestTags.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (!tag) return
    const res = await window.api.setTagFolderForTag(tag.id, folderId)
    if (!res.ok) throw new Error(res.error)
  }

  const tagIdByNameLower = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tags) map.set(t.name.toLowerCase(), t.id)
    return map
  }, [tags])

  function formatTagLabel(name: string): string {
    const id = tagIdByNameLower.get(name.toLowerCase())
    if (!id) return name
    const folderName = folderNameByTagId.get(id)
    if (!folderName) return name
    return `${folderName} / ${name}`
  }

  function getTagAccentStyle(tagName: string): FolderAccentStyle | undefined {
    return getFolderAccentStyle(folderIdByTagNameLower.get(tagName.toLowerCase()) ?? null)
  }

  function getTagClassName(tagName: string, baseClass: 'tag' | 'chip', isActive = false): string {
    const classes: string[] = [baseClass]
    if (isActive) classes.push('on')
    if ((folderIdByTagNameLower.get(tagName.toLowerCase()) ?? null) != null) classes.push('folder-tag')
    return classes.join(' ')
  }

  async function createTagFolder() {
    const n = normalizeTagName(newTagFolderName)
    if (!n) return
    setError(null)
    const res = await window.api.createTagFolder(n)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setNewTagFolderName('')
    await refreshTagFolders()
    setExpandedTagFolderIds((prev) => ({ ...prev, [res.id]: true }))
  }

  async function deleteTagFolder(folder: TagFolderRow) {
    const folderTagNames = tags
      .filter((tag) => folder.tagIds.includes(tag.id))
      .map((tag) => tag.name)
    const tagCount = folderTagNames.length
    const confirmed = confirm(
      tagCount > 0
        ? `למחוק את התיקייה "${folder.name}"? ${tagCount} התגיות שבתוכה יעברו ל"ללא תיקייה".`
        : `למחוק את התיקייה "${folder.name}"?`
    )
    if (!confirmed) return

    setError(null)
    setOpenTagFolderMenuId(null)
    await window.api.deleteTagFolder(folder.id)

    setExpandedTagFolderIds((prev) => {
      const next = { ...prev }
      delete next[folder.id]
      return next
    })
    setExpandedLibraryFolderIds((prev) => {
      const next = { ...prev }
      delete next[folder.id]
      return next
    })
    setExpandedSearchFolderIds((prev) => {
      const next = { ...prev }
      delete next[folder.id]
      return next
    })
    setLibraryTagFolderByName((prev) => {
      const next = { ...prev }
      for (const name of folderTagNames) next[name.toLowerCase()] = null
      return next
    })

    await refreshTags()
    await refreshTagFolders()
    void runSearch()
  }

  async function assignTagToFolder(tagId: number, folderIdRaw: string) {
    const folderId = folderIdRaw ? Number(folderIdRaw) : null
    const res = await window.api.setTagFolderForTag(tagId, folderId)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refreshTagFolders()
  }

  async function handlePackageForTransfer(rebuildInstaller: boolean) {
    setError(null)
    setTransferMsg(null)
    setTransferRevealPath(null)
    setTransferBuildChoiceOpen(false)
    setIsPackagingTransfer(true)
    setTransferProgress({ stage: 'select-destination', message: 'ממתין לבחירת תיקיית יעד...' })
    try {
      const res = await window.api.packageAppForTransfer({ rebuildInstaller })
      if (res.ok === false) {
        if (!res.cancelled) {
          setTransferProgress({ stage: 'error', message: 'אריזת ההתקנה נכשלה', detail: res.error ?? '' })
          setError(res.error ?? 'אריזת ההתקנה נכשלה')
        } else {
          setTransferProgress(null)
        }
        return
      }
      const copiedDataSummary =
        res.copiedUserDataFiles.length > 0
          ? `נתוני משתמש שנכללו: ${res.copiedUserDataFiles.map((filePath) => filePath.split(/[/\\]/).pop() ?? filePath).join(', ')}.`
          : 'לא נמצאו קבצי נתוני משתמש להעתקה.'
      const missingDataSummary =
        res.missingUserDataFiles.length > 0
          ? ` קבצים חסרים: ${res.missingUserDataFiles.join(', ')}.`
          : ''
      const installerStrategySummary =
        res.installerStrategy === 'existing' ? 'נעשה שימוש במתקין קיים.' : 'נבנה מתקין חדש.'
      setTransferMsg(
        `נוצרה חבילה להעברה בתיקייה: ${res.bundleDir}\nמתקין: ${res.installerPath}\n${installerStrategySummary}\n${copiedDataSummary}${missingDataSummary}`
      )
      setTransferRevealPath(res.installerPath)
      setTransferProgress({ stage: 'done', message: 'האריזה הושלמה בהצלחה.' })
    } finally {
      setIsPackagingTransfer(false)
    }
  }

  async function handleImportUserDataFromBackup(): Promise<void> {
    setError(null)
    setTransferMsg('פותח חלונית לבחירת קבצי גיבוי...')
    setIsImportingUserData(true)
    try {
      const res = await window.api.importUserDataFromBackup()
      if (!res.ok) {
        if (res.cancelled) {
          setTransferMsg('טעינת נתונים בוטלה.')
        } else {
          setError(res.error ?? 'טעינת נתוני משתמש נכשלה')
          setTransferMsg(`טעינת הנתונים נכשלה: ${res.error ?? 'שגיאה לא ידועה'}`)
        }
        return
      }
      setTransferMsg(
        `הטעינה הצליחה.\nנטענו קבצים: ${res.copiedFiles.join(', ')}.\nהאפליקציה תופעל מחדש אוטומטית כדי לטעון את הנתונים.`
      )
    } finally {
      setIsImportingUserData(false)
    }
  }

  async function refreshSearchTagData(): Promise<void> {
    await refreshTags()
    await refreshTagFolders()
    await runSearch()
  }

  const openPreviewInWatermarkTab = useCallback((path: string) => {
    setTab('watermark')
    setWatermarkOpenFromPreview((prev) => ({ path, id: (prev?.id ?? 0) + 1 }))
  }, [])

  const openPreviewInFacesTab = useCallback((path: string) => {
    setTab('faces')
    setFaceOpenFromPreview((prev) => ({ path, id: (prev?.id ?? 0) + 1 }))
  }, [])

  const onWatermarkOpenFromPreviewHandled = useCallback((handledId: number) => {
    setWatermarkOpenFromPreview((cur) => (cur?.id === handledId ? null : cur))
  }, [])

  const onFaceOpenFromPreviewHandled = useCallback((handledId: number) => {
    setFaceOpenFromPreview((cur) => (cur?.id === handledId ? null : cur))
  }, [])

  async function chooseTagIoScope() {
    setError(null)
    const folder = await window.api.pickFolder()
    if (folder) setTagIoScopePath(folder)
  }

  async function handleExportTagsJson() {
    if (!tagIoScopePath) {
      setError('יש לבחור תיקייה או כונן לייצוא')
      return
    }
    setError(null)
    setTagIoMsg(null)
    const res = await window.api.exportTagsJson(tagIoScopePath)
    if (!res.ok) {
      if (!res.cancelled) setError(res.error ?? 'ייצוא נכשל')
      return
    }
    setTagIoMsg(`יוצאו ${res.exportedCount} רשומות לקובץ: ${res.filePath}`)
  }

  async function handleImportPreview() {
    if (!tagIoScopePath) {
      setError('יש לבחור תיקייה או כונן לייבוא')
      return
    }
    setError(null)
    setTagIoMsg(null)
    const res = await window.api.importTagsPreview(tagIoScopePath)
    if (!res.ok) {
      if (!res.cancelled) setError(res.error ?? 'ניתוח ייבוא נכשל')
      return
    }
    setImportPreview(res.preview)
    setImportChoicesByPath({})
    setTagIoMsg(
      `נטענו ${res.preview.totalEntries} רשומות: חדשות ${res.preview.newEntries}, ללא שינוי ${res.preview.unchangedEntries}, התנגשויות ${res.preview.conflictEntries}`
    )
  }

  async function handleApplyImport() {
    if (!importPreview) {
      setError('אין נתוני ייבוא להחלה')
      return
    }
    if (!confirm('להחיל את הייבוא לפי ההגדרות שבחרת?')) return
    setError(null)
    setImportApplying(true)
    setImportProgress({ done: 0, total: 0 })
    const res = await window.api.importTagsApply({
      sourceFilePath: importPreview.sourceFilePath,
      scopePath: importPreview.scopePath,
      defaultConflictChoice: importDefaultChoice,
      conflictChoicesByPath: importChoicesByPath
    })
    if (!res.ok) {
      setError(res.error)
      setImportApplying(false)
      setImportProgress(null)
      return
    }
    setTagIoMsg(`ייבוא הוחל: עודכנו ${res.appliedCount} רשומות, דולגו ${res.skippedCount}`)
    setImportApplying(false)
    setImportProgress(null)
    await refreshTags()
  }

  function toggleQuickSearchTag(name: string) {
    setSearchSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    )
  }

  async function handleSelectSearchResult(path: string) {
    setSelectedSearchPath(path)
    const ts = await window.api.getEffectiveTagsForPath(path)
    setSelectedSearchDirectTags(ts)
  }

  async function addTagToSearchFile(tagName: string, withFolderPrompt = false) {
    if (!selectedSearchPath) return
    const n = normalizeTagName(tagName)
    if (!n) return
    if (selectedSearchDirectTags.some((t) => t.toLowerCase() === n.toLowerCase())) return
    let folderChoice: number | null | undefined = null
    if (withFolderPrompt) {
      folderChoice = await promptTagFolderChoice(n, getFolderIdByTagName(n))
      if (folderChoice === undefined) return
    }
    setError(null)
    await window.api.addTagToPath(selectedSearchPath, n)
    if (withFolderPrompt) {
      await assignFolderByTagName(n, folderChoice ?? null)
      await refreshTagFolders()
    }
    setSelectedSearchDirectTags((prev) => [...prev, n].sort((a, b) => a.localeCompare(b)))
    await refreshTags()
    void runSearch()
  }

  async function removeTagFromSearchFile(tagName: string) {
    if (!selectedSearchPath) return
    setError(null)
    const res = await window.api.removeTagFromPath(selectedSearchPath, tagName)
    if (!res.ok) setError(res.error)
    else {
      setSelectedSearchDirectTags((prev) => prev.filter((t) => t !== tagName))
      await refreshTags()
      void runSearch()
    }
  }

  return (
    <div className="app" dir="rtl">
      <header className="topbar">
        <h1>ניהול ארכיון</h1>
        <nav className="nav">
          {(
            [
              ['library', 'ספרייה'],
              ['search', 'חיפוש'],
              ['tags', 'תגיות'],
              ['faces', 'זיהוי פנים'],
              ['watermark', 'סימן מים'],
              ['cloud-sync', 'סנכרון ענן'],
              ['settings', 'הגדרות']
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="muted small" style={{ marginInlineStart: 'auto' }}>
          גרסה {appVersion}
        </span>
      </header>

      <main className="main">
        {error && (
          <p className="muted" style={{ color: 'var(--danger)', marginTop: 0 }}>
            {error}
          </p>
        )}

        {tab === 'library' && (
          <section className="panel">
            {!librarySelectedItems ? (
              <div>
                <p className="muted small" style={{ marginTop: 0, marginBottom: '1rem' }}>
                  בחרו קובץ או תיקייה, הוסיפו תגיות ושמרו. המידע נשמר במחשב לצורך חיפוש.
                </p>
                <div className="toolbar">
                  <button type="button" className="btn primary" onClick={handlePickFiles}>
                    בחר קבצים
                  </button>
                  <button type="button" className="btn primary" onClick={handlePickFolders}>
                    בחר תיקיות
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="muted small" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                  פריטים נבחרים:
                </p>
                <ul className="path-list" style={{ marginBottom: '1rem' }}>
                  {librarySelectedItems.map((item) => (
                    <li key={item.path} className="path-cell">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <FilePreview
                          key={item.path}
                          filePath={item.path}
                          onOpenInWatermark={openPreviewInWatermarkTab}
                          onOpenInFaces={openPreviewInFacesTab}
                        />
                        <span>
                          {item.path} <span className="muted">({kindHe(item.kind)})</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="field" style={{ marginBottom: '0.75rem' }}>
                  <label>תגיות (ניתן להוסיף, להסיר, או לבחור מרשימה)</label>
                  <div className="toolbar" style={{ alignItems: 'stretch' }}>
                    <input
                      style={{ flex: 1, minWidth: 160 }}
                      placeholder="הקלד תגית"
                      value={libraryTagDraft}
                      onChange={(e) => setLibraryTagDraft(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), void requestAddLibraryTag(libraryTagDraft))
                      }
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => void requestAddLibraryTag(libraryTagDraft)}
                    >
                      הוסף תגית
                    </button>
                  </div>
                  {libraryTags.length > 0 && (
                    <div className="tags" style={{ marginTop: '0.5rem' }}>
                      {libraryTags.map((t) => (
                        <span key={t} className={getTagClassName(t, 'tag')} style={getTagAccentStyle(t)}>
                          {formatTagLabel(t)}
                          <button type="button" className="x" title="הסר" onClick={() => removeLibraryTag(t)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {libraryFolderSuggestions.length > 0 && (
                    <>
                      <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                        הצעות לפי שם תיקייה:
                      </p>
                      <div className="chips">
                        {libraryFolderSuggestions
                          .filter((s) => !libraryTags.some((t) => t.toLowerCase() === s.toLowerCase()))
                          .map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="chip"
                              onClick={() => void requestAddLibraryTag(s)}
                              title="הוסף כתגית"
                            >
                              {s}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                  {tags.length > 0 && (
                    <>
                      <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                        בחירה מתגיות קיימות:
                      </p>
                      {tagFolders.length > 0 && (
                        <div className="chips" style={{ marginBottom: '0.35rem' }}>
                          {tagFolders.map((folder) => (
                            <button
                              key={`library-folder-${folder.id}`}
                              type="button"
                              className={`chip folder-chip ${expandedLibraryFolderIds[folder.id] ? 'on' : ''}`}
                              style={getFolderAccentStyle(folder.id)}
                              onClick={() =>
                                setExpandedLibraryFolderIds((prev) => ({
                                  ...prev,
                                  [folder.id]: !prev[folder.id]
                                }))
                              }
                            >
                              {folder.name} ({folder.tagIds.length})
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="chips">
                        {tags
                          .filter((t) => !folderIdByTagId.has(t.id))
                          .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={getTagClassName(
                              t.name,
                              'chip',
                              libraryTags.some((x) => x.toLowerCase() === t.name.toLowerCase())
                            )}
                            style={getTagAccentStyle(t.name)}
                            onClick={() => void requestAddLibraryTag(t.name)}
                            title={libraryTags.includes(t.name) ? 'כבר קיים' : 'הוסף'}
                          >
                            {formatTagLabel(t.name)}
                          </button>
                        ))}
                      </div>
                      {tagFolders.map((folder) => {
                        if (!expandedLibraryFolderIds[folder.id]) return null
                        const folderTags = tags.filter((t) => folderIdByTagId.get(t.id) === folder.id)
                        return (
                          <div key={`library-folder-tags-${folder.id}`} className="chips" style={{ marginTop: '0.35rem' }}>
                            {folderTags.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                className={getTagClassName(
                                  t.name,
                                  'chip',
                                  libraryTags.some((x) => x.toLowerCase() === t.name.toLowerCase())
                                )}
                                style={getTagAccentStyle(t.name)}
                                onClick={() => void requestAddLibraryTag(t.name)}
                                title={libraryTags.includes(t.name) ? 'כבר קיים' : 'הוסף'}
                              >
                                {formatTagLabel(t.name)}
                              </button>
                            ))}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
                <div className="toolbar">
                  <button type="button" className="btn primary" onClick={() => void handleLibrarySaveAndDone()}>
                    שמור וסיים
                  </button>
                  <button type="button" className="btn" onClick={handleLibraryCancel}>
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'search' && (
          <section className="panel">
            <p className="muted small">
              הוסיפו תגיות לחיפוש — יוצגו רק <strong>קבצים</strong> שיש להם את <strong>כל</strong> התגיות.
              ללא תגיות — לא יוצג כלום. ניתן לצמצם חיפוש לתיקייה או כונן מסוים.
            </p>
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label>חיפוש בתוך (אופציונלי)</label>
              <div className="toolbar">
                <input
                  readOnly
                  style={{ flex: 1, minWidth: 200, background: 'rgba(26, 26, 46, 0.6)' }}
                  value={searchScope ?? 'כל הנתיבים'}
                  title={searchScope ?? ''}
                />
                <button type="button" className="btn" onClick={() => void handlePickSearchScope()}>
                  בחר תיקייה/כונן
                </button>
                {searchScope && (
                  <button type="button" className="btn" onClick={() => setSearchScope(null)}>
                    נקה
                  </button>
                )}
              </div>
            </div>
            <div className="field">
              <label>הוספת תגית לשאילתת החיפוש</label>
              <div className="toolbar">
                <input
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder="הקלד תגית"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToSearchQuery())}
                />
                <button type="button" className="btn primary" onClick={addToSearchQuery}>
                  הוסף לחיפוש
                </button>
                <button type="button" className="btn" onClick={() => void refreshSearchTagData()}>
                  רענן תגיות
                </button>
              </div>
            </div>
            {searchSelected.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <span className="muted small">תגיות פעילות בחיפוש:</span>
                <div className="tags" style={{ marginTop: '0.35rem' }}>
                  {searchSelected.map((t) => (
                    <span key={t} className={getTagClassName(t, 'tag')} style={getTagAccentStyle(t)}>
                      {formatTagLabel(t)}
                      <button type="button" className="x" title="הסר מחיפוש" onClick={() => removeSearchTag(t)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="muted small">בחירה מהירה מתוך תגיות קיימות במערכת:</p>
            {tagFolders.length > 0 && (
              <div className="chips" style={{ marginBottom: '0.5rem' }}>
                {tagFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className={`chip folder-chip ${expandedSearchFolderIds[folder.id] ? 'on' : ''}`}
                    style={getFolderAccentStyle(folder.id)}
                    onClick={() =>
                      setExpandedSearchFolderIds((prev) => ({
                        ...prev,
                        [folder.id]: !prev[folder.id]
                      }))
                    }
                  >
                    {folder.name} ({folder.tagIds.length})
                  </button>
                ))}
              </div>
            )}
            <div className="chips">
              {tags
                .filter((t) => !folderIdByTagId.has(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={getTagClassName(t.name, 'chip', searchSelected.includes(t.name))}
                    style={getTagAccentStyle(t.name)}
                    onClick={() => toggleQuickSearchTag(t.name)}
                  >
                    {formatTagLabel(t.name)}
                  </button>
                ))}
            </div>
            {tagFolders.map((folder) => {
              if (!expandedSearchFolderIds[folder.id]) return null
              const folderTags = tags.filter((t) => folderIdByTagId.get(t.id) === folder.id)
              return (
                <div key={`search-folder-${folder.id}`} className="chips" style={{ marginTop: '0.45rem' }}>
                  {folderTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={getTagClassName(t.name, 'chip', searchSelected.includes(t.name))}
                      style={getTagAccentStyle(t.name)}
                      onClick={() => toggleQuickSearchTag(t.name)}
                    >
                      {formatTagLabel(t.name)}
                    </button>
                  ))}
                </div>
              )
            })}
            {tags.length === 0 && <p className="muted">אין עדיין תגיות. הוסיפו קבצים או תיקיות מהספרייה.</p>}
            {searchTruncated && (
              <p className="muted small" style={{ marginBottom: '0.5rem' }}>
                מוצגות 5,000 התוצאות הראשונות. צמצם את החיפוש או הוסף תגיות.
              </p>
            )}
            {searchSelected.length > 0 && !searchTruncated && !searchLoading && searchResultsFiltered.length === 0 && (
              <p className="muted small" style={{ marginBottom: '0.5rem' }}>
                אין תוצאות.
              </p>
            )}
            {searchLoading && (
              <p className="muted small" style={{ marginBottom: '0.5rem' }}>
                מחפש...
              </p>
            )}
            <div className="table-wrap" style={{ height: '60vh' }}>
              <TableVirtuoso
                data={searchResultsFiltered}
                fixedHeaderContent={() => (
                  <tr>
                    <th style={{ width: 44 }} />
                    <th>קובץ</th>
                    <th>תגיות</th>
                    <th />
                  </tr>
                )}
                itemClassName={(index) => (selectedSearchPath === searchResultsFiltered[index]?.path ? 'selected' : '')}
                itemContent={(_index, row) => (
                  <>
                    <td>
                      <FilePreview
                        key={row.path}
                        filePath={row.path}
                        onOpenInWatermark={openPreviewInWatermarkTab}
                        onOpenInFaces={openPreviewInFacesTab}
                      />
                    </td>
                    <td className="path-cell">
                      <button
                        type="button"
                        className="path-open-btn"
                        onClick={() => void window.api.openPath(row.path)}
                        title="פתח קובץ"
                      >
                        {row.path}
                      </button>
                    </td>
                    <td>
                      <div className="search-tags-collapsed">
                        <div className="tags">
                          {row.tags.slice(0, 5).map((t) => (
                            <span key={t} className={getTagClassName(t, 'tag')} style={getTagAccentStyle(t)}>
                              {formatTagLabel(t)}
                            </span>
                          ))}
                        </div>
                        {row.tags.length > 5 && (
                          <button
                            type="button"
                            className="btn small-btn"
                            style={{ marginTop: '0.35rem' }}
                            onClick={() => setSearchTagsModal({ open: true, path: row.path, tags: row.tags })}
                          >
                            הצג את כל התגיות ({row.tags.length})
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small-btn"
                        onClick={() => handleSelectSearchResult(row.path)}
                        title="ערוך תגיות"
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        className="btn small-btn"
                        onClick={() => window.api.showInFolder(row.path)}
                        title="הצג בסייר הקבצים"
                      >
                        הצג בסייר
                      </button>
                    </td>
                  </>
                )}
              />
            </div>
            {selectedSearchPath && (
              <div
                className="overlay"
                style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem' }}
                onClick={(e) => e.target === e.currentTarget && setSelectedSearchPath(null)}
              >
                <div
                  className="overlay-card"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 560 }}
                >
                  <p className="muted small" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                    עריכת תגיות לקובץ: {selectedSearchPath}
                  </p>
                  <div className="tags" style={{ marginBottom: '0.5rem' }}>
                  {selectedSearchDirectTags.map((t) => (
                    <span key={t} className={getTagClassName(t, 'tag')} style={getTagAccentStyle(t)}>
                      {formatTagLabel(t)}
                      <button
                        type="button"
                        className="x"
                        title="הסר תגית"
                        onClick={() => void removeTagFromSearchFile(t)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                  <input
                    style={{ flex: 1, minWidth: 140 }}
                    placeholder="הקלד תגית"
                    value={searchFileTagDraft}
                    onChange={(e) => setSearchFileTagDraft(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), void addTagToSearchFile(searchFileTagDraft, true), setSearchFileTagDraft(''))
                    }
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => (void addTagToSearchFile(searchFileTagDraft, true), setSearchFileTagDraft(''))}
                  >
                    הוסף תגית
                  </button>
                  <button type="button" className="btn" onClick={() => setSelectedSearchPath(null)}>
                    סגור
                  </button>
                </div>
                {tags.length > 0 && (
                  <>
                    <p className="muted small">בחירה מתגיות קיימות:</p>
                    <div className="chips">
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={getTagClassName(
                            t.name,
                            'chip',
                            selectedSearchDirectTags.some((x) => x.toLowerCase() === t.name.toLowerCase())
                          )}
                          style={getTagAccentStyle(t.name)}
                          onClick={() => void addTagToSearchFile(t.name)}
                        >
                          {formatTagLabel(t.name)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'tags' && (
          <section className="panel">
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label>יצירת תיקייה לתגיות</label>
              <div className="toolbar">
                <input
                  value={newTagFolderName}
                  onChange={(e) => setNewTagFolderName(e.target.value)}
                  placeholder="שם תיקייה"
                  style={{ flex: 1, minWidth: 160 }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void createTagFolder())}
                />
                <button type="button" className="btn primary" onClick={() => void createTagFolder()}>
                  צור תיקייה
                </button>
              </div>
            </div>
            {tagFolders.length > 0 && (
              <div className="chips" style={{ marginTop: 0 }}>
                {tagFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="folder-chip-wrap"
                    style={getFolderAccentStyle(folder.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`chip folder-chip ${expandedTagFolderIds[folder.id] ? 'on' : ''}`}
                      style={getFolderAccentStyle(folder.id)}
                      title={`תגיות בתיקייה: ${folder.tagIds.length}`}
                      onClick={() =>
                        setExpandedTagFolderIds((prev) => ({
                          ...prev,
                          [folder.id]: !prev[folder.id]
                        }))
                      }
                    >
                      {folder.name} ({folder.tagIds.length})
                    </button>
                    <button
                      type="button"
                      className="folder-chip-menu-trigger"
                      aria-label={`אפשרויות עבור ${folder.name}`}
                      title="אפשרויות תיקייה"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenTagFolderMenuId((prev) => (prev === folder.id ? null : folder.id))
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                    {openTagFolderMenuId === folder.id && (
                      <div
                        className="folder-chip-menu"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <button type="button" className="folder-chip-menu-item danger" onClick={() => void deleteTagFolder(folder)}>
                          מחק תיקייה
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="muted small" style={{ marginTop: 0 }}>
              מוצגות כברירת מחדל רק תגיות ללא תיקייה. תגיות משויכות מוצגות רק לאחר פתיחת התיקייה שלהן.
            </p>
            {tagFolders.map((folder) => {
              if (!expandedTagFolderIds[folder.id]) return null
              const folderTags = tags.filter((t) => folderIdByTagId.get(t.id) === folder.id)
              return (
                <div
                  key={folder.id}
                  className="table-wrap folder-table-wrap"
                  style={{ ...getFolderAccentStyle(folder.id), marginBottom: '0.75rem' }}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>תגית ({folder.name})</th>
                        <th>תיקייה</th>
                        <th>שינוי שם</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {folderTags.map((t) => (
                        <TagRenameRow
                          key={t.id}
                          tag={t}
                          folderId={folder.id}
                          folders={tagFolders}
                          onAssignFolder={(folderId) => void assignTagToFolder(t.id, folderId)}
                          onChanged={async () => {
                            await refreshTags()
                            await refreshTagFolders()
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>תגית</th>
                    <th>תיקייה</th>
                    <th>שינוי שם</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tags
                    .filter((t) => !folderIdByTagId.has(t.id))
                    .map((t) => (
                      <TagRenameRow
                        key={t.id}
                        tag={t}
                        folderId={null}
                        folders={tagFolders}
                        onAssignFolder={(folderId) => void assignTagToFolder(t.id, folderId)}
                        onChanged={async () => {
                          await refreshTags()
                          await refreshTagFolders()
                        }}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'faces' && (
          <section className="panel">
            <FaceRecognitionTab
              onTagsChanged={refreshSearchTagData}
              openFromPreview={faceOpenFromPreview}
              onOpenFromPreviewHandled={onFaceOpenFromPreviewHandled}
            />
          </section>
        )}

        {tab === 'watermark' && (
          <section className="panel">
            <WatermarkEditorTab
              openFromPreview={watermarkOpenFromPreview}
              onOpenFromPreviewHandled={onWatermarkOpenFromPreviewHandled}
            />
          </section>
        )}

        {tab === 'cloud-sync' && <SyncPage />}

        {tab === 'settings' && (
          <section className="panel">
            <div className="toolbar" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className={settingsView === 'updates' ? 'btn primary' : 'btn'}
                onClick={() => setSettingsView('updates')}
              >
                עדכונים
              </button>
              <button
                type="button"
                className={settingsView === 'io' ? 'btn primary' : 'btn'}
                onClick={() => setSettingsView('io')}
              >
                ייבוא/ייצוא
              </button>
              <button
                type="button"
                className={settingsView === 'transfer' ? 'btn primary' : 'btn'}
                onClick={() => setSettingsView('transfer')}
              >
                העברה
              </button>
              <button
                type="button"
                className={settingsView === 'about' ? 'btn primary' : 'btn'}
                onClick={() => setSettingsView('about')}
              >
                הסבר על האפליקציה
              </button>
            </div>

            {settingsView === 'updates' && <UpdateSection />}

            {settingsView === 'io' && (
              <>
                <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <label>ייצוא/ייבוא תגיות לפי תחום (כונן/תיקייה)</label>
                  <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                    <input
                      readOnly
                      style={{ flex: 1, minWidth: 220, background: 'rgba(26, 26, 46, 0.6)' }}
                      value={tagIoScopePath ?? 'לא נבחר תחום'}
                      title={tagIoScopePath ?? ''}
                    />
                    <button type="button" className="btn" onClick={() => void chooseTagIoScope()}>
                      בחר תחום
                    </button>
                    {tagIoScopePath && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setTagIoScopePath(null)
                          setImportPreview(null)
                          setTagIoMsg(null)
                        }}
                      >
                        נקה
                      </button>
                    )}
                  </div>
                  <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                    <button type="button" className="btn primary" onClick={() => void handleExportTagsJson()}>
                      ייצוא תגיות לקובץ JSON
                    </button>
                    <button type="button" className="btn" onClick={() => void handleImportPreview()}>
                      טעינת קובץ ייבוא וניתוח התנגשויות
                    </button>
                  </div>
                  {importPreview && (
                    <div className="field" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                      <p className="muted small" style={{ margin: 0 }}>
                        קובץ: {importPreview.sourceFilePath}
                      </p>
                      <p className="muted small" style={{ margin: 0 }}>
                        סיכום: סה״כ {importPreview.totalEntries}, חדשים {importPreview.newEntries}, ללא שינוי{' '}
                        {importPreview.unchangedEntries}, התנגשויות {importPreview.conflictEntries}
                      </p>
                      <div className="field">
                        <label>ברירת מחדל להתנגשות</label>
                        <select
                          value={importDefaultChoice}
                          onChange={(e) => setImportDefaultChoice(e.target.value as ImportConflictChoice)}
                          style={{ maxWidth: 280 }}
                        >
                          <option value="skip">דלג</option>
                          <option value="replace">החלף בקובץ הייבוא</option>
                          <option value="merge">מזג תגיות</option>
                        </select>
                      </div>
                      {importPreview.conflicts.length > 0 && (
                        <div className="table-wrap" style={{ marginTop: '0.25rem' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>נתיב</th>
                                <th>קיים</th>
                                <th>מיובא</th>
                                <th>החלטה</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importPreview.conflicts.map((c) => (
                                <tr key={c.path}>
                                  <td className="path-cell">{c.path}</td>
                                  <td className="path-cell">{c.existingDirectTags.join(', ') || '—'}</td>
                                  <td className="path-cell">{c.importedDirectTags.join(', ') || '—'}</td>
                                  <td>
                                    <select
                                      value={importChoicesByPath[c.path] ?? importDefaultChoice}
                                      onChange={(e) =>
                                        setImportChoicesByPath((prev) => ({
                                          ...prev,
                                          [c.path]: e.target.value as ImportConflictChoice
                                        }))
                                      }
                                    >
                                      <option value="skip">דלג</option>
                                      <option value="replace">החלף</option>
                                      <option value="merge">מזג</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="toolbar" style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={importApplying}
                          onClick={() => void handleApplyImport()}
                        >
                          החל ייבוא
                        </button>
                      </div>
                    </div>
                  )}
                  {tagIoMsg && <p className="muted">{tagIoMsg}</p>}
                </div>
              </>
            )}

            {settingsView === 'transfer' && (
              <>
                <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <label>אריזת התקנה להעברה למחשב אחר</label>
                  <p className="muted small" style={{ marginTop: '0.35rem' }}>
                    הפעולה תיצור תיקיית חבילה שכוללת מתקין עדכני של התוכנה, את נתוני המשתמש הקיימים אם נמצאו, וקובץ
                    הוראות קצר להעברה.
                  </p>
                  <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void window.api.openAppUserDataDir()}
                    >
                      פתח תיקיית נתוני האפליקציה
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void handleImportUserDataFromBackup()}
                      disabled={isImportingUserData || isPackagingTransfer}
                    >
                      {isImportingUserData ? 'טוען נתונים...' : 'טען נתונים מקבצי גיבוי'}
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={isPackagingTransfer}
                      onClick={() => {
                        setTransferMsg(null)
                        setTransferProgress(null)
                        setTransferBuildChoiceOpen((prev) => !prev)
                      }}
                    >
                      {isPackagingTransfer ? 'אורז...' : 'ארוז התקנה ונתונים להעברה'}
                    </button>
                    {transferRevealPath && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void window.api.showInFolder(transferRevealPath)}
                      >
                        פתח תיקיית תוצאה
                      </button>
                    )}
                  </div>
                  {transferBuildChoiceOpen && !isPackagingTransfer && (
                    <div className="transfer-build-choice-card">
                      <p className="transfer-build-choice-title">איך לארוז את המתקין?</p>
                      <p className="muted small" style={{ marginTop: 0, marginBottom: '0.65rem' }}>
                        אפשר להשתמש במתקין קיים כדי לחסוך זמן, או לבנות מתקין חדש ועדכני לפני האריזה.
                      </p>
                      <div className="toolbar" style={{ marginBottom: 0 }}>
                        <button type="button" className="btn primary" onClick={() => void handlePackageForTransfer(true)}>
                          בנה מתקין חדש
                        </button>
                        <button type="button" className="btn" onClick={() => void handlePackageForTransfer(false)}>
                          השתמש במתקין קיים
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setTransferBuildChoiceOpen(false)}
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                  {transferMsg && (
                    <p className="muted small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                      {transferMsg}
                    </p>
                  )}
                  {transferProgress && (
                    <div
                      className={`transfer-progress-card ${transferProgress.stage === 'error' ? 'error' : transferProgress.stage === 'done' ? 'done' : ''}`}
                    >
                      <div className="transfer-progress-head">
                        <div>
                          <p className="transfer-progress-title">התקדמות האריזה</p>
                          <p className="transfer-progress-stage">{transferProgress.message}</p>
                        </div>
                        <div className="transfer-progress-percent">{transferProgressPercent}%</div>
                      </div>
                      <div className="transfer-progress-bar" aria-hidden="true">
                        <div
                          className="transfer-progress-bar-fill"
                          style={{ width: `${transferProgressPercent}%` }}
                        />
                      </div>
                      {transferProgress.detail && (
                        <p className="transfer-progress-detail">{transferProgress.detail}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {settingsView === 'about' && (
              <>
                <p className="muted small">
                  <strong>ספרייה:</strong> בחרו קבצים/תיקיות, הוסיפו תגיות, ואז לחצו <strong>שמור וסיים</strong>.
                  התגים נשמרים מקומית לצורך חיפוש.
                </p>
                <p className="muted small">
                  <strong>חיפוש:</strong> בחרו תגיות — יוצגו רק <strong>קבצים</strong> שמכילים <strong>את כל</strong> התגיות.
                  ניתן לצמצם לנתיב/כונן מסוים. לחיצה על שורה פותחת את הקובץ, ו־<strong>ערוך</strong> מאפשר לשנות תגיות.
                </p>
                <p className="muted small">
                  <strong>תגיות:</strong> אפשר לשנות שם לתגית או למחוק אותה (זה ישפיע על כל המערכת).
                </p>
                <p className="muted small" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <strong>ייבוא/ייצוא:</strong> לשונית זו מאפשרת לייצא תגיות לקובץ JSON לפי תחום, ואז לייבא בחזרה.
                  בעת ייבוא מוצג preview עם התנגשויות, כדי שתוכלו לבחור מה לעשות לפני שהשינויים מוחלים.
                </p>
              </>
            )}
          </section>
        )}
      </main>

      {indexing && (
        <div className="overlay">
          <div className="overlay-card">
            <strong>אינדוקס תיקייה</strong>
            <p className="muted small" style={{ wordBreak: 'break-all' }}>
              {indexing.currentPath}
            </p>
            <div className="progress-bar">
              <div
                style={{
                  width: indexing.total ? `${Math.min(100, (indexing.done / indexing.total) * 100)}%` : '0%'
                }}
              />
            </div>
            <p className="muted small">
              {indexing.done} / {indexing.total || '…'} קבצים
            </p>
            <div className="toolbar" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn danger" onClick={() => void handleCancelIndex()}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      {importApplying && importProgress && (
        <div className="overlay">
          <div className="overlay-card">
            <strong>ייבוא תגיות</strong>
            <p className="muted small">
              {importProgress.done} / {importProgress.total || '…'} רשומות
            </p>
            <div className="progress-bar">
              <div
                style={{
                  width: importProgress.total
                    ? `${Math.min(100, (importProgress.done / importProgress.total) * 100)}%`
                    : '0%'
                }}
              />
            </div>
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              מעבד… אל תסגור את האפליקציה.
            </p>
          </div>
        </div>
      )}
      {tagFolderPicker.open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeTagFolderPicker(undefined)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <strong>שיוך תגית לתיקייה</strong>
            <p className="muted small" style={{ marginBottom: '0.5rem' }}>
              תגית: <strong>{tagFolderPicker.tagName}</strong>
            </p>
            <div className="field">
              <label>בחר תיקייה</label>
              <select
                value={tagFolderPicker.selectedFolderId}
                onChange={(e) => setTagFolderPicker((prev) => ({ ...prev, selectedFolderId: e.target.value }))}
              >
                <option value="">ללא תיקייה</option>
                {tagFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => closeTagFolderPicker(tagFolderPicker.selectedFolderId ? Number(tagFolderPicker.selectedFolderId) : null)}
              >
                אישור
              </button>
              <button type="button" className="btn" onClick={() => closeTagFolderPicker(undefined)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      {searchTagsModal.open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSearchTagsModal({ open: false, path: '', tags: [] })}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <strong>כל התגיות לקובץ</strong>
            <p className="muted small" style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}>
              {searchTagsModal.path}
            </p>
            <div className="tags">
              {searchTagsModal.tags.map((t) => (
                <span key={t} className={getTagClassName(t, 'tag')} style={getTagAccentStyle(t)}>
                  {formatTagLabel(t)}
                </span>
              ))}
            </div>
            <div className="toolbar" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
              <button type="button" className="btn" onClick={() => setSearchTagsModal({ open: false, path: '', tags: [] })}>
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span className="app-footer-symbol">©</span>
          <span className="app-footer-text">כל הזכויות שמורות ארכיון 'פני זקן'</span>
        </div>
      </footer>
    </div>
  )
}

function WatermarkEditorTab({
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
  const [textContent, setTextContent] = useState('')
  const [textRect, setTextRect] = useState<WatermarkSelectionRect | null>(null)
  const [textStyle, setTextStyle] = useState<WatermarkTextStyleState>(() => ({ ...DEFAULT_WATERMARK_TEXT_STYLE }))
  const [selectionShape, setSelectionShape] = useState<WatermarkSelectionShape>('rect')
  const [blurStrength, setBlurStrength] = useState(14)
  const [blurFeather, setBlurFeather] = useState(24)
  const [focusSeparation, setFocusSeparation] = useState(45)
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.35)
  const [processedPreviewSrc, setProcessedPreviewSrc] = useState<string | null>(null)
  const [blurPreviewSourceKey, setBlurPreviewSourceKey] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [isExporting, setIsExporting] = useState(false)
  const [exportOverlay, setExportOverlay] = useState<WatermarkExportOverlayState>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const isCustomWatermark = !!watermarkImagePath && watermarkImagePath !== defaultWatermarkAssetUrl
  const isSelectionToolActive = activeTool === 'crop' || activeTool === 'blur'
  const textDragStateRef = useRef<{
    mode: 'move' | 'resize'
    startClientX: number
    startClientY: number
    startRect: WatermarkSelectionRect
  } | null>(null)
  const baseIsVideo = useMemo(
    () => !!baseImagePath && isWatermarkVideoPath(baseImagePath),
    [baseImagePath]
  )

  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const baseVideoRef = useRef<HTMLVideoElement | null>(null)
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
  const blurPreviewSourceRef = useRef<BlurPreviewSource | null>(null)
  const blurredPreviewCacheRef = useRef<{ blurStrength: number; imageData: ImageData } | null>(null)
  const blurPreviewFrameRef = useRef<number | null>(null)
  const blurPreviewTimerRef = useRef<number | null>(null)

  const updateStageSize = useCallback(() => {
    const el = baseVideoRef.current ?? baseImgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setStageSize({
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height)
    })
  }, [])

  const onClipRangeChange = useCallback((start: number, end: number) => {
    setClipStartSec(start)
    setClipEndSec(end)
  }, [])

  const placeDefaultWatermark = useCallback((baseWidth: number, baseHeight: number, aspectRatio: number) => {
    const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
    const width = clampNumber(Math.round(baseWidth * 0.22), 48, Math.max(48, baseWidth))
    const height = clampNumber(Math.round(width / ratio), 48, Math.max(48, baseHeight))
    return {
      width,
      height,
      x: Math.max(0, baseWidth - width - 24),
      y: Math.max(0, baseHeight - height - 24)
    }
  }, [])

  const createDefaultSelectionRect = useCallback((baseWidth: number, baseHeight: number) => {
    const width = Math.max(80, Math.round(baseWidth * 0.72))
    const height = Math.max(80, Math.round(baseHeight * 0.72))
    return {
      width,
      height,
      x: Math.max(0, Math.round((baseWidth - width) / 2)),
      y: Math.max(0, Math.round((baseHeight - height) / 2))
    }
  }, [])

  const placeDefaultTextRect = useCallback((baseWidth: number, baseHeight: number): WatermarkSelectionRect => {
    const w = Math.max(120, Math.round(baseWidth * 0.62))
    const h = Math.max(72, Math.round(baseHeight * 0.16))
    const x = Math.round((baseWidth - w) / 2)
    const y = Math.max(0, baseHeight - h - Math.round(baseHeight * 0.05))
    return { x, y, width: w, height: h }
  }, [])

  const getPlacementBounds = useCallback(
    (size: { width: number; height: number }, crop: WatermarkSelectionRect | null) => {
      if (!crop) return { x: 0, y: 0, width: size.width, height: size.height }
      return crop
    },
    []
  )

  const clampWatermarkIntoBounds = useCallback(
    (
      rect: WatermarkSelectionRect,
      size: { width: number; height: number },
      crop: WatermarkSelectionRect | null
    ): WatermarkSelectionRect => {
      const bounds = getPlacementBounds(size, crop)
      const width = clampNumber(rect.width, 40, Math.max(40, bounds.width))
      const height = clampNumber(rect.height, 40, Math.max(40, bounds.height))
      return {
        width,
        height,
        x: Math.round(clampNumber(rect.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
        y: Math.round(clampNumber(rect.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)))
      }
    },
    [getPlacementBounds]
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
      const defaultRect = placeDefaultWatermark(w, h, ratio)
      setWatermarkRect(clampWatermarkIntoBounds(defaultRect, { width: w, height: h }, null))
    } else {
      setWatermarkRect(null)
    }
  }, [clampWatermarkIntoBounds, placeDefaultWatermark, watermarkAspectRatio, watermarkImageSrc])

  const currentWatermarkBounds = useMemo(
    () => (activeTool === 'crop' ? selectionRect : null),
    [activeTool, selectionRect]
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

  const ensureSelectionRect = useCallback(() => {
    if (!baseImageSize) return
    setSelectionRect((prev) => prev ?? createDefaultSelectionRect(baseImageSize.width, baseImageSize.height))
  }, [baseImageSize, createDefaultSelectionRect])

  const blurSliderInteractionProps = {}

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
      if (tool === 'text') {
        setEditorError(null)
        setActiveTool('text')
        if (baseImageSize) {
          setTextRect((prev) => prev ?? placeDefaultTextRect(baseImageSize.width, baseImageSize.height))
        }
        setTextContent((t) => (t.trim() ? t : 'טקסט'))
        return
      }
      setEditorError(null)
      setActiveTool(tool)
      if (tool !== 'none') ensureSelectionRect()
    },
    [baseImagePath, baseImageSize, ensureSelectionRect, placeDefaultTextRect]
  )

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
    setTextContent('')
    setTextRect(null)
    setTextStyle({ ...DEFAULT_WATERMARK_TEXT_STYLE })
    setBlurStrength(14)
    setBlurFeather(24)
    setFocusSeparation(45)
    setWatermarkOpacity(0.35)
    setProcessedPreviewSrc(null)
    setBlurPreviewSourceKey(0)
    setStageSize({ width: 0, height: 0 })
    setIsExporting(false)
    setExportOverlay(null)
    setExportMsg(null)
    setEditorError(null)
    dragStateRef.current = null
    selectionDragStateRef.current = null
    blurPreviewSourceRef.current = null
    blurredPreviewCacheRef.current = null
    if (blurPreviewFrameRef.current) {
      window.cancelAnimationFrame(blurPreviewFrameRef.current)
      blurPreviewFrameRef.current = null
    }
    if (blurPreviewTimerRef.current) {
      window.clearTimeout(blurPreviewTimerRef.current)
      blurPreviewTimerRef.current = null
    }
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
      setProcessedPreviewSrc(null)
      blurPreviewSourceRef.current = null
    }
  }, [baseImagePath])

  useEffect(() => {
    if (!baseImageSrc && !baseVideoUrl) return
    updateStageSize()
    const target = baseVideoRef.current ?? baseImgRef.current
    if (!target || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateStageSize())
    observer.observe(target)
    window.addEventListener('resize', updateStageSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateStageSize)
    }
  }, [baseImageSrc, baseVideoUrl, updateStageSize])

  useEffect(() => {
    let disposed = false

    if (!baseImageSrc) {
      blurPreviewSourceRef.current = null
      blurredPreviewCacheRef.current = null
      setProcessedPreviewSrc(null)
      setBlurPreviewSourceKey(0)
      return
    }

    void createBlurPreviewSource(baseImageSrc)
      .then((source) => {
        if (disposed) return
        blurPreviewSourceRef.current = source
        blurredPreviewCacheRef.current = null
        setBlurPreviewSourceKey((prev) => prev + 1)
        if (activeTool !== 'blur') {
          setProcessedPreviewSrc(null)
        }
      })
      .catch(() => {
        if (disposed) return
        blurPreviewSourceRef.current = null
        blurredPreviewCacheRef.current = null
        setProcessedPreviewSrc(null)
        setBlurPreviewSourceKey(0)
      })

    return () => {
      disposed = true
    }
  }, [activeTool, baseImageSrc])

  const requestBlurPreviewRender = useCallback(
    (debounceMs: number) => {
      if (blurPreviewFrameRef.current) {
        window.cancelAnimationFrame(blurPreviewFrameRef.current)
        blurPreviewFrameRef.current = null
      }
      if (blurPreviewTimerRef.current) {
        window.clearTimeout(blurPreviewTimerRef.current)
        blurPreviewTimerRef.current = null
      }

      if (activeTool !== 'blur' || !blurSelection) {
        setProcessedPreviewSrc(null)
        return
      }

      const render = () => {
        const source = blurPreviewSourceRef.current
        if (!source) return

        const cached = blurredPreviewCacheRef.current
        const blurredImageData =
          cached && cached.blurStrength === blurParams.blurStrength
            ? cached.imageData
            : createBlurredPreviewImageData(source, blurParams)

        if (!cached || cached.blurStrength !== blurParams.blurStrength) {
          blurredPreviewCacheRef.current = { blurStrength: blurParams.blurStrength, imageData: blurredImageData }
        }

        setProcessedPreviewSrc(renderBlurPreviewDataUrl(source, blurredImageData, blurSelection, blurParams))
      }

      const scheduleFrame = () => {
        blurPreviewFrameRef.current = window.requestAnimationFrame(() => {
          blurPreviewFrameRef.current = null
          render()
        })
      }

      if (debounceMs > 0) {
        blurPreviewTimerRef.current = window.setTimeout(scheduleFrame, debounceMs)
      } else {
        scheduleFrame()
      }
    },
    [activeTool, blurParams, blurSelection]
  )

  useEffect(() => {
    requestBlurPreviewRender(0)
    return () => {
      if (blurPreviewFrameRef.current) {
        window.cancelAnimationFrame(blurPreviewFrameRef.current)
        blurPreviewFrameRef.current = null
      }
    }
  }, [activeTool, blurPreviewSourceKey, blurSelection, requestBlurPreviewRender])

  useEffect(() => {
    requestBlurPreviewRender(90)
    return () => {
      if (blurPreviewTimerRef.current) {
        window.clearTimeout(blurPreviewTimerRef.current)
        blurPreviewTimerRef.current = null
      }
    }
  }, [blurParams, blurPreviewSourceKey, requestBlurPreviewRender])

  useEffect(() => {
    if (!baseImageSize || activeTool === 'none' || activeTool === 'text') return
    setSelectionRect((prev) => prev ?? createDefaultSelectionRect(baseImageSize.width, baseImageSize.height))
  }, [activeTool, baseImageSize, createDefaultSelectionRect])

  useEffect(() => {
    if (!baseImageSize) return
    setTextRect((prev) =>
      prev ? clampWatermarkIntoBounds(prev, baseImageSize, currentWatermarkBounds) : prev
    )
  }, [baseImageSize, clampWatermarkIntoBounds, currentWatermarkBounds])

  useEffect(() => {
    if (!baseImageSize || !watermarkRect) return
    setWatermarkRect((prev) => (prev ? clampWatermarkIntoBounds(prev, baseImageSize, currentWatermarkBounds) : prev))
  }, [baseImageSize, clampWatermarkIntoBounds, currentWatermarkBounds, watermarkRect])

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

      if (drag.mode === 'move') {
        const width = drag.startRect.width
        const height = drag.startRect.height
        setTextRect({
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

      const nextW = clampNumber(
        drag.startRect.width + deltaX,
        80,
        Math.max(80, bounds.x + bounds.width - drag.startRect.x)
      )
      const nextH = clampNumber(
        drag.startRect.height + deltaY,
        48,
        Math.max(48, bounds.y + bounds.height - drag.startRect.y)
      )
      setTextRect({
        ...drag.startRect,
        width: Math.round(nextW),
        height: Math.round(nextH)
      })
    },
    [baseImageSize, currentWatermarkBounds, getPlacementBounds, stageSize.height, stageSize.width]
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
    [baseImageSize, currentWatermarkBounds, getPlacementBounds, stageSize.height, stageSize.width, watermarkAspectRatio, watermarkRect]
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
    [activeTool, baseImageSize, clampWatermarkIntoBounds, selectionRect, stageSize.height, stageSize.width]
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
    if (isWatermarkVideoPath(nextPath)) {
      setActiveTool('none')
      setProcessedPreviewSrc(null)
      blurPreviewSourceRef.current = null
      setBaseImageSrc(null)
      setBaseImageSize(null)
      setSelectionRect(null)
      setWatermarkRect(null)
      setTextRect(null)
      setTextContent('')
      setTextStyle({ ...DEFAULT_WATERMARK_TEXT_STYLE })
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
    setTextRect(null)
    setTextContent('')
    setTextStyle({ ...DEFAULT_WATERMARK_TEXT_STYLE })
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
    if (watermarkImageSrc) {
      const defaultRect = placeDefaultWatermark(dims.width, dims.height, watermarkAspectRatio)
      setWatermarkRect(
        clampWatermarkIntoBounds(defaultRect, dims, activeTool === 'crop' ? nextSelection : null)
      )
    } else {
      setWatermarkRect(null)
    }
    setSelectionRect(nextSelection)
  }

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

  function startTextDrag(event: React.MouseEvent, mode: 'move' | 'resize'): void {
    if (!textRect) return
    event.preventDefault()
    event.stopPropagation()
    textDragStateRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: textRect
    }
  }

  async function exportMain(): Promise<void> {
    if (!baseImagePath || !watermarkImagePath || !watermarkRect) {
      setEditorError('יש לבחור מדיה ראשית וסימן מים לפני הייצוא.')
      return
    }
    if (baseIsVideo) {
      if (!baseImageSize || videoDurationSec <= 0) {
        setEditorError('ממתין לטעינת הווידאו. נסה שוב כשהתצוגה מוכנה.')
        return
      }
      if (clipEndSec <= clipStartSec) {
        setEditorError('זמן הסיום חייב להיות אחרי זמן ההתחלה.')
        return
      }
    } else if ((activeTool === 'crop' || activeTool === 'blur') && !selectionRect) {
      setEditorError('בחר אזור על התמונה לפני הייצוא.')
      return
    }
    setEditorError(null)
    setExportMsg(null)
    setIsExporting(true)
    let unsubVideoProgress: (() => void) | undefined
    let unsubImageBusy: (() => void) | undefined
    const textOverlayPayload =
      textContent.trim() && textRect
        ? {
            dataUrl: renderWatermarkTextLayerDataUrl(textContent, textRect.width, textRect.height, textStyle),
            x: textRect.x,
            y: textRect.y,
            width: textRect.width,
            height: textRect.height
          }
        : undefined
    try {
      if (baseIsVideo) {
        unsubVideoProgress = window.api.onWatermarkVideoExportProgress((p) => {
          setExportOverlay((prev) => ({
            kind: 'video',
            percent: Math.min(100, Math.max(0, p.percent)),
            fileName: p.outputBaseName ?? (prev?.kind === 'video' ? prev.fileName : '')
          }))
        })
        const res = await window.api.exportWatermarkedVideo({
          baseVideoPath: baseImagePath,
          watermarkImagePath,
          x: watermarkRect.x,
          y: watermarkRect.y,
          width: watermarkRect.width,
          height: watermarkRect.height,
          opacity: watermarkOpacity,
          startSec: clipStartSec,
          endSec: clipEndSec,
          textOverlay: textOverlayPayload
        })
        if (!res.ok) {
          if (!res.cancelled) setEditorError(res.error ?? 'ייצוא הסרט נכשל.')
          return
        }
        setExportMsg(`הסרט יוצא בהצלחה: ${res.filePath}`)
        return
      }
      unsubImageBusy = window.api.onWatermarkImageExportBusy((p) => {
        setExportOverlay({ kind: 'image', fileName: p.outputBaseName })
      })
      const res = await window.api.exportWatermarkedImage({
        baseImagePath,
        watermarkImagePath,
        blurPreviewScale: activeTool === 'blur' ? blurPreviewSourceRef.current?.scale : undefined,
        x: watermarkRect.x,
        y: watermarkRect.y,
        width: watermarkRect.width,
        height: watermarkRect.height,
        opacity: watermarkOpacity,
        toolMode: activeTool === 'crop' || activeTool === 'blur' ? activeTool : 'none',
        selectionShape,
        selectionX: selectionRect?.x,
        selectionY: selectionRect?.y,
        selectionWidth: selectionRect?.width,
        selectionHeight: selectionRect?.height,
        blurStrength,
        blurFeather,
        focusSeparation,
        textOverlay: textOverlayPayload
      })
      if (!res.ok) {
        if (!res.cancelled) setEditorError(res.error ?? 'ייצוא התמונה נכשל.')
        return
      }
      setExportMsg(`התמונה יוצאה בהצלחה: ${res.filePath}`)
    } finally {
      unsubVideoProgress?.()
      unsubImageBusy?.()
      setExportOverlay(null)
      setIsExporting(false)
    }
  }

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

  const displayTextRect = useMemo(() => {
    if (!textRect || !baseImageSize || stageSize.width <= 0 || stageSize.height <= 0) return null
    const scaleX = stageSize.width / baseImageSize.width
    const scaleY = stageSize.height / baseImageSize.height
    return {
      left: textRect.x * scaleX,
      top: textRect.y * scaleY,
      width: textRect.width * scaleX,
      height: textRect.height * scaleY
    }
  }, [baseImageSize, stageSize.height, stageSize.width, textRect])

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

  const circleFeatherPreviewGeometry = useMemo(() => {
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
  }, [activeTool, blurFeatherPreviewPx, displaySelectionRect, selectionShape])

  const rectFeatherPreviewGeometry = useMemo(() => {
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
  }, [activeTool, blurFeatherPreviewPx, displaySelectionRect, selectionShape])

  const circleFeatherOuterStyle = useMemo<CSSProperties | null>(() => {
    if (!circleFeatherPreviewGeometry || circleFeatherPreviewGeometry.feather <= 0) return null
    return {
      left: circleFeatherPreviewGeometry.outer.left,
      top: circleFeatherPreviewGeometry.outer.top,
      width: circleFeatherPreviewGeometry.outer.width,
      height: circleFeatherPreviewGeometry.outer.height,
      borderRadius: '9999px'
    }
  }, [circleFeatherPreviewGeometry])

  const rectFeatherBandStyle = useMemo<CSSProperties | null>(() => {
    if (!rectFeatherPreviewGeometry || rectFeatherPreviewGeometry.feather <= 0) return null
    const feather = rectFeatherPreviewGeometry.feather
    return {
      left: rectFeatherPreviewGeometry.outer.left,
      top: rectFeatherPreviewGeometry.outer.top,
      width: rectFeatherPreviewGeometry.outer.width,
      height: rectFeatherPreviewGeometry.outer.height,
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
  }, [rectFeatherPreviewGeometry])

  const rectFeatherOuterStyle = useMemo<CSSProperties | null>(() => {
    if (!rectFeatherPreviewGeometry || rectFeatherPreviewGeometry.feather <= 0) return null
    return {
      left: rectFeatherPreviewGeometry.outer.left,
      top: rectFeatherPreviewGeometry.outer.top,
      width: rectFeatherPreviewGeometry.outer.width,
      height: rectFeatherPreviewGeometry.outer.height,
      borderRadius: '16px'
    }
  }, [rectFeatherPreviewGeometry])

  const selectionOverlayStyle = useMemo<CSSProperties | null>(() => {
    if (!displaySelectionRect || activeTool === 'none' || activeTool === 'text') return null
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
  }, [activeTool, displaySelectionRect, selectionShape])

  const innerSelectionBorderStyle = useMemo<CSSProperties | null>(() => {
    if (!displaySelectionRect || activeTool !== 'blur') return null
    return {
      left: displaySelectionRect.left,
      top: displaySelectionRect.top,
      width: displaySelectionRect.width,
      height: displaySelectionRect.height,
      borderRadius: selectionShape === 'circle' ? '9999px' : '12px'
    }
  }, [activeTool, displaySelectionRect, selectionShape])

  const toolSummary = baseIsVideo
    ? activeTool === 'text'
      ? 'טקסט: גרור את המסגרת, ערוך בפס למטה.'
      : 'וידאו: סימן מים, טקסט וייצוא קטע (ללא חיתוך או טשטוש על הפריים).'
    : activeTool === 'crop'
      ? `חיתוך פעיל: ${selectionShape === 'circle' ? 'עגול' : 'מרובע'}.`
      : activeTool === 'blur'
        ? `טשטוש רקע פעיל: ${selectionShape === 'circle' ? 'בחירה עגולה' : 'בחירה מרובעת'}.`
        : activeTool === 'text'
          ? 'טקסט: גרור את המסגרת, ערוך בפס למטה.'
          : 'אין כרגע כלי עריכה פעיל.'

  const usesExactBlurPreview = activeTool === 'blur' && !!processedPreviewSrc
  const previewImageSrc = usesExactBlurPreview ? processedPreviewSrc : baseImageSrc
  const showWatermarkStage = !!(previewImageSrc || baseVideoUrl)
  const exportDisabled =
    !baseImagePath ||
    !watermarkImagePath ||
    !watermarkRect ||
    isExporting ||
    (baseIsVideo && (videoDurationSec <= 0 || clipEndSec <= clipStartSec))

  return (
    <div className="watermark-editor-tab">
      <p className="muted small" style={{ marginTop: 0 }}>
        טען תמונה או סרטון ראשית, גרור את סימן המים למיקום הרצוי. בתמונות ניתן להשתמש בכלים לחיתוך או לטשטוש רקע לפני
        הייצוא; בווידאו ניתן להוסיף סימן מים וטקסט ולייצא קטע לפי טווח זמן (ללא חיתוך או טשטוש על הפריים).
      </p>

      {(editorError || exportMsg) && (
        <p className="muted" style={{ color: editorError ? 'var(--danger)' : '#86efac', marginTop: '0.6rem' }}>
          {editorError ?? exportMsg}
        </p>
      )}

      <div className="watermark-workspace">
        <div className="watermark-side-panel">
          <div className="toolbar watermark-side-actions">
            <button type="button" className="btn primary" onClick={() => void pickBaseMedia()}>
              בחר תמונה או סרטון ראשי
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => (isCustomWatermark ? resetWatermarkToDefault() : void pickWatermarkImage())}
              disabled={!watermarkImageSrc && isCustomWatermark}
            >
              {isCustomWatermark ? 'חזור ללוגו' : 'העלה סימן מים אחר'}
            </button>
            <div className="watermark-action-row">
              <button
                type="button"
                className={`btn ${isToolsOpen ? 'primary' : ''}`}
                onClick={() => setIsToolsOpen((prev) => !prev)}
                disabled={!baseImageSrc && !baseVideoUrl}
              >
                כלים
              </button>
              <button
                type="button"
                className="btn primary watermark-export-btn"
                onClick={() => void exportMain()}
                disabled={exportDisabled}
                title={
                  isExporting ? 'מייצא...' : baseIsVideo ? 'ייצא קטע MP4 עם סימן מים' : 'ייצא תמונה'
                }
                aria-label={isExporting ? 'מייצא' : baseIsVideo ? 'ייצא סרט' : 'ייצא תמונה'}
              >
                {isExporting ? (
                  <span className="watermark-export-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            {isToolsOpen && (baseImageSrc || baseVideoUrl) && (
              <div className="watermark-tools-panel">
                <div className="watermark-tool-icons-row">
                  <button
                    type="button"
                    className={`btn watermark-tool-icon-btn ${activeTool === 'crop' ? 'primary' : ''}`}
                    onClick={() => activateTool('crop')}
                    disabled={baseIsVideo}
                    title="חיתוך"
                    aria-label="חיתוך"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4.5 10.25A.75.75 0 0 1 3.75 9.5V6A2.25 2.25 0 0 1 6 3.75h3.5a.75.75 0 0 1 0 1.5H6a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 1-.75.75Zm10 0a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75H18A2.25 2.25 0 0 1 20.25 6v3.5a.75.75 0 0 1-1.5 0V6a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 1 0-1.5H18A2.25 2.25 0 0 1 20.25 6v3.5a.75.75 0 0 1-.75.75ZM6 20.25A2.25 2.25 0 0 1 3.75 18v-3.5a.75.75 0 0 1 1.5 0V18c0 .41.34.75.75.75h3.5a.75.75 0 0 1 0 1.5H6Zm8.5 0a.75.75 0 0 1 0-1.5H18a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 1 1.5 0V18A2.25 2.25 0 0 1 18 20.25h-3.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`btn watermark-tool-icon-btn ${activeTool === 'blur' ? 'primary' : ''}`}
                    onClick={() => activateTool('blur')}
                    disabled={baseIsVideo}
                    title="טשטוש רקע"
                    aria-label="טשטוש רקע"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12.46 2.6c.31.42 7.54 8.22 7.54 13.08A7.98 7.98 0 0 1 12 23.65 7.98 7.98 0 0 1 4 15.68C4 10.82 11.23 3.02 11.54 2.6a.58.58 0 0 1 .92 0Zm-.46 2.71c-2.2 2.54-6.83 8.37-6.83 10.37A6.83 6.83 0 0 0 12 22.52a6.83 6.83 0 0 0 6.83-6.84c0-2-4.63-7.83-6.83-10.37Zm3.21 7.66c1.55 0 2.8 1.33 2.8 2.98 0 1.37-.91 2.53-2.16 2.87-.23.06-.46-.16-.38-.39.11-.35.17-.72.17-1.11 0-1.9-1.37-3.48-3.16-3.78-.24-.04-.34-.33-.17-.5a3.38 3.38 0 0 1 2.9-1.07Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`btn watermark-tool-icon-btn ${activeTool === 'text' ? 'primary' : ''}`}
                    onClick={() => activateTool('text')}
                    title="טקסט"
                    aria-label="טקסט"
                  >
                    <span className="watermark-tool-letter-icon" aria-hidden="true">
                      T
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`btn watermark-tool-icon-btn ${selectionShape === 'rect' ? 'primary' : ''}`}
                    onClick={() => setSelectionShape('rect')}
                    disabled={baseIsVideo}
                    title="בחירה מרובעת"
                    aria-label="בחירה מרובעת"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M7 4.75h10A2.25 2.25 0 0 1 19.25 7v10A2.25 2.25 0 0 1 17 19.25H7A2.25 2.25 0 0 1 4.75 17V7A2.25 2.25 0 0 1 7 4.75Zm0 1.5A.75.75 0 0 0 6.25 7v10c0 .41.34.75.75.75h10c.41 0 .75-.34.75-.75V7a.75.75 0 0 0-.75-.75H7Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`btn watermark-tool-icon-btn ${selectionShape === 'circle' ? 'primary' : ''}`}
                    onClick={() => setSelectionShape('circle')}
                    disabled={baseIsVideo}
                    title="בחירה עגולה"
                    aria-label="בחירה עגולה"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 4.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5Zm0 1.5a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
                <button type="button" className="btn watermark-tool-cancel-btn" onClick={() => setActiveTool('none')}>
                  ביטול בחירת כלי
                </button>
                {activeTool !== 'none' && (
                  <div className="watermark-tools-settings">
                    {activeTool === 'blur' && (
                      <>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>עוצמת טשטוש: {blurStrength}</label>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            step={1}
                            value={blurStrength}
                            onChange={(e) => setBlurStrength(Number(e.target.value))}
                            {...blurSliderInteractionProps}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>ריכוך: {blurFeather}</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={blurFeather}
                            onChange={(e) => setBlurFeather(Number(e.target.value))}
                            {...blurSliderInteractionProps}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>רמת ניגודיות בין הבחירה לרקע: {focusSeparation}%</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={focusSeparation}
                            onChange={(e) => setFocusSeparation(Number(e.target.value))}
                            {...blurSliderInteractionProps}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="btn" onClick={resetEditor}>
              ביטול
            </button>
          </div>

          <div className="field">
            <label>שקיפות סימן המים: {Math.round(watermarkOpacity * 100)}%</label>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={Math.round(watermarkOpacity * 100)}
              onChange={(e) => setWatermarkOpacity(Number(e.target.value) / 100)}
              disabled={!watermarkImageSrc}
            />
          </div>

          {baseIsVideo && videoDurationSec > 0 && (
            <p className="muted small" style={{ margin: 0 }}>
              טווח הקטע לייצוא מוגדר מתחת לתצוגת הווידאו (גרירת סימונים על ציר הזמן).
            </p>
          )}

          <div className="watermark-status-list">
            <p className="muted small">
              {baseImagePath
                ? baseIsVideo
                  ? `סרט ראשי: ${baseImagePath}`
                  : `תמונה ראשית: ${baseImagePath}`
                : 'עדיין לא נבחרה מדיה ראשית.'}
            </p>
            <p className="muted small">
              {watermarkImagePath === defaultWatermarkAssetUrl
                ? 'סימן המים הנוכחי: לוגו המערכת (ברירת מחדל).'
                : `סימן המים הנוכחי: ${watermarkImagePath ?? 'לא נבחר סימן מים'}`}
            </p>
            <p className="muted small" style={{ marginTop: 0 }}>
              גרור את סימן המים עם העכבר. לשינוי גודל השתמש בידית שבפינה הימנית-תחתונה.
            </p>
            <p className="muted small">{toolSummary}</p>
            {isSelectionToolActive && (
              <p className="muted small">
                גרור את מסגרת הבחירה לשינוי מיקום. בצורה עגולה ניתן לשנות גודל רק מארבעה צדדים.
              </p>
            )}
            {activeTool === 'text' && (
              <p className="muted small">גרור את מסגרת הטקסט; ערוך תוכן ועיצוב בפס מתחת לתצוגה.</p>
            )}
          </div>
        </div>

        <div className="watermark-preview-card">
          {showWatermarkStage ? (
            <div className="watermark-preview-media-col">
              <div className="watermark-stage">
              {baseVideoUrl ? (
                <video
                  ref={baseVideoRef}
                  src={baseVideoUrl}
                  controls
                  muted
                  playsInline
                  onLoadedMetadata={onBaseVideoMetadata}
                  onLoadedData={updateStageSize}
                />
              ) : (
                <img ref={baseImgRef} src={previewImageSrc!} alt="" onLoad={updateStageSize} />
              )}
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
              {displayTextRect && textRect && activeTool === 'text' && (
                <div
                  className="watermark-text-overlay-item"
                  style={{
                    left: displayTextRect.left,
                    top: displayTextRect.top,
                    width: displayTextRect.width,
                    height: displayTextRect.height,
                    color: textStyle.color,
                    fontFamily: textStyle.fontFamily,
                    fontSize: Math.max(
                      8,
                      (textStyle.fontSizePx * displayTextRect.width) / Math.max(1, textRect.width)
                    ),
                    fontWeight: textStyle.bold ? 700 : 400,
                    fontStyle: textStyle.italic ? 'italic' : 'normal',
                    direction: 'rtl'
                  }}
                  onMouseDown={(e) => startTextDrag(e, 'move')}
                >
                  <div className="watermark-text-overlay-inner">{textContent || ' '}</div>
                  <button
                    type="button"
                    className="watermark-resize-handle"
                    title="שנה גודל מסגרת טקסט"
                    aria-label="שנה גודל מסגרת טקסט"
                    onMouseDown={(e) => startTextDrag(e, 'resize')}
                  />
                </div>
              )}
              </div>
              {activeTool === 'text' && showWatermarkStage && (
                <div className="watermark-text-toolbar">
                  <div className="watermark-text-toolbar-row">
                    <label className="watermark-text-toolbar-label">תוכן</label>
                    <textarea
                      className="watermark-text-toolbar-textarea"
                      dir="rtl"
                      rows={2}
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="הקלד טקסט…"
                    />
                  </div>
                  <div className="watermark-text-toolbar-row watermark-text-toolbar-controls">
                    <label className="watermark-text-toolbar-label tight">צבע</label>
                    <input
                      type="color"
                      value={textStyle.color.startsWith('#') ? textStyle.color : '#ffffff'}
                      onChange={(e) => setTextStyle((s) => ({ ...s, color: e.target.value }))}
                      title="צבע טקסט"
                    />
                    <label className="watermark-text-toolbar-label tight">גודל</label>
                    <input
                      type="range"
                      min={12}
                      max={96}
                      value={textStyle.fontSizePx}
                      onChange={(e) =>
                        setTextStyle((s) => ({ ...s, fontSizePx: Number(e.target.value) }))
                      }
                    />
                    <span className="watermark-text-toolbar-num">{textStyle.fontSizePx}px</span>
                    <label className="watermark-text-toolbar-label tight">גופן</label>
                    <select
                      value={textStyle.fontFamily}
                      onChange={(e) => setTextStyle((s) => ({ ...s, fontFamily: e.target.value }))}
                    >
                      {WATERMARK_TEXT_FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`btn watermark-text-style-btn ${textStyle.bold ? 'primary' : ''}`}
                      onClick={() => setTextStyle((s) => ({ ...s, bold: !s.bold }))}
                      title="מודגש"
                    >
                      <strong>B</strong>
                    </button>
                    <button
                      type="button"
                      className={`btn watermark-text-style-btn ${textStyle.italic ? 'primary' : ''}`}
                      onClick={() => setTextStyle((s) => ({ ...s, italic: !s.italic }))}
                      title="נטוי"
                    >
                      <em>I</em>
                    </button>
                  </div>
                </div>
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
      </div>
      {exportOverlay &&
        createPortal(
          <div className="watermark-export-overlay" aria-live="polite" aria-busy="true">
            <div className="watermark-export-overlay-card">
              <p className="watermark-export-overlay-title">
                מייצא{' '}
                <span className="watermark-export-filename" dir="ltr">
                  {exportOverlay.fileName || '…'}
                </span>
              </p>
              {exportOverlay.kind === 'video' ? (
                <>
                  <div className="watermark-export-bar-wrap">
                    <div
                      className="watermark-export-bar-fill"
                      style={{ width: `${exportOverlay.percent}%` }}
                    />
                  </div>
                  <p className="watermark-export-percent">{Math.round(exportOverlay.percent)}%</p>
                </>
              ) : (
                <div className="watermark-export-indeterminate" />
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function FaceRecognitionTab({
  onTagsChanged,
  openFromPreview,
  onOpenFromPreviewHandled
}: {
  onTagsChanged?: () => Promise<void> | void
  openFromPreview?: { path: string; id: number } | null
  onOpenFromPreviewHandled?: (handledId: number) => void
}) {
  const LEGACY_FACE_MODEL_ID = 'legacy.faceapi.v1'
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [modelsState, setModelsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectedFaces, setDetectedFaces] = useState<
    { box: { x: number; y: number; width: number; height: number }; descriptor: number[] }[]
  >([])
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({})
  const [candidateByIndex, setCandidateByIndex] = useState<Record<number, {
    personId: number
    name: string
    distance: number
    confidence: number
    threshold: number
    confidenceLabel: 'high' | 'probable' | 'uncertain'
  } | null>>(
    {}
  )
  const [activeFaceIndex, setActiveFaceIndex] = useState<number | null>(null)
  const [faceResolvedByIndex, setFaceResolvedByIndex] = useState<Record<number, 'yes' | 'no'>>({})
  const [faceSavedByIndex, setFaceSavedByIndex] = useState<Record<number, string>>({})
  const [faceSaving, setFaceSaving] = useState(false)
  const [activeModelId, setActiveModelId] = useState(FACE_EMBEDDING_MODEL_ID)
  const [knownTags, setKnownTags] = useState<TagRow[]>([])
  const [knownTagFolders, setKnownTagFolders] = useState<TagFolderRow[]>([])
  const [tagFolderPicker, setTagFolderPicker] = useState<{ open: boolean; tagName: string; selectedFolderId: string }>({
    open: false,
    tagName: '',
    selectedFolderId: ''
  })

  const imgRef = useRef<HTMLImageElement | null>(null)
  const ensureLegacyModelsPromiseRef = useRef<Promise<void> | null>(null)
  const detectRunIdRef = useRef(0)
  const tagFolderPickerResolverRef = useRef<((value: number | null | undefined) => void) | null>(null)

  async function ensureLegacyModelsLoaded() {
    if (ensureLegacyModelsPromiseRef.current) return ensureLegacyModelsPromiseRef.current
    ensureLegacyModelsPromiseRef.current = (async () => {
      if (faceapi.tf) {
        await faceapi.tf.setBackend('cpu')
        await faceapi.tf.ready()
      }
      const uri = new URL('./face-models', window.location.href).toString()
      await faceapi.nets.ssdMobilenetv1.loadFromUri(uri)
      await faceapi.nets.faceLandmark68Net.loadFromUri(uri)
      await faceapi.nets.faceRecognitionNet.loadFromUri(uri)
    })()
    return ensureLegacyModelsPromiseRef.current
  }

  async function detectFacesViaLegacy(imgEl: HTMLImageElement, scaleX: number, scaleY: number): Promise<FaceDetection[]> {
    await ensureLegacyModelsLoaded()
    const detections = await faceapi.detectAllFaces(imgEl).withFaceLandmarks().withFaceDescriptors()
    return detections.map((d) => {
      const b = d.detection.box
      return {
        box: {
          x: b.x * scaleX,
          y: b.y * scaleY,
          width: b.width * scaleX,
          height: b.height * scaleY
        },
        descriptor: Array.from(d.descriptor)
      }
    })
  }

  const loadFaceImagePath = useCallback(async (image: string) => {
    setImageError(null)
    setImagePath(image)
    setImageSrc(null)
    setDetectedFaces([])
    setNameDrafts({})
    setCandidateByIndex({})
    setActiveFaceIndex(null)
    setFaceResolvedByIndex({})
    setFaceSavedByIndex({})
    setModelsError(null)
    setModelsState('idle')
    setIsImageLoading(true)
    try {
      const src = await window.api.getImageDataUrl(image)
      if (!src) {
        setImageError('טעינת תמונה נכשלה')
        setImagePath(null)
        return
      }
      setImageSrc(src)
    } finally {
      setIsImageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!openFromPreview) return
    const { path, id } = openFromPreview
    let cancelled = false
    void (async () => {
      try {
        await loadFaceImagePath(path)
      } finally {
        if (!cancelled) onOpenFromPreviewHandled?.(id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openFromPreview?.id, openFromPreview?.path, loadFaceImagePath, onOpenFromPreviewHandled])

  async function pickImage() {
    const image = await window.api.pickImage()
    if (!image) return
    await loadFaceImagePath(image)
  }

  function clearCurrentImage(): void {
    setImagePath(null)
    setImageSrc(null)
    setDetectedFaces([])
    setNameDrafts({})
    setCandidateByIndex({})
    setActiveFaceIndex(null)
    setFaceResolvedByIndex({})
    setFaceSavedByIndex({})
    setImageError(null)
    setModelsError(null)
    setModelsState('idle')
    setIsImageLoading(false)
  }

  async function refreshKnownTagData(): Promise<void> {
    const [tagsList, folders] = await Promise.all([window.api.listTags(), window.api.listTagFolders()])
    setKnownTags(tagsList)
    setKnownTagFolders(folders)
  }

  function getKnownFolderIdByTagName(name: string): number | null {
    const n = normalizeTagName(name)
    if (!n) return null
    const tag = knownTags.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (!tag) return null
    const folder = knownTagFolders.find((f) => f.tagIds.includes(tag.id))
    return folder ? folder.id : null
  }

  async function promptTagFolderChoice(tagName: string, initialFolderId: number | null): Promise<number | null | undefined> {
    return await new Promise<number | null | undefined>((resolve) => {
      tagFolderPickerResolverRef.current = resolve
      setTagFolderPicker({
        open: true,
        tagName,
        selectedFolderId: initialFolderId === null ? '' : String(initialFolderId)
      })
    })
  }

  function closeTagFolderPicker(nextValue: number | null | undefined): void {
    const resolve = tagFolderPickerResolverRef.current
    tagFolderPickerResolverRef.current = null
    setTagFolderPicker({ open: false, tagName: '', selectedFolderId: '' })
    resolve?.(nextValue)
  }

  async function assignFolderByTagName(tagName: string, folderId: number | null): Promise<void> {
    const tagsList = await window.api.listTags()
    const n = normalizeTagName(tagName)
    const tag = tagsList.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (!tag) return
    const res = await window.api.setTagFolderForTag(tag.id, folderId)
    if (!res.ok) throw new Error(res.error)
  }

  async function detectFacesForCurrentImage() {
    if (!imagePath || !imageSrc) return
    let imgEl = imgRef.current
    if (!imgEl) {
      // In rare timing cases the effect can run before the <img> ref is set.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      imgEl = imgRef.current
    }
    if (!imgEl) return

    const runId = (detectRunIdRef.current += 1)
    setIsDetecting(true)
    setImageError(null)

    try {
      setModelsState('loading')
      setModelsError(null)
      const analysis = await window.api.analyzeAndMatchFacesInImage(imagePath)
      if (detectRunIdRef.current !== runId) return

      if (!imgEl.complete || imgEl.naturalWidth === 0) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => resolve()
          const onError = () => reject(new Error('טעינת תמונה נכשלה'))
          imgEl.addEventListener('load', onLoad, { once: true })
          imgEl.addEventListener('error', onError, { once: true })
        })
      }
      if (detectRunIdRef.current !== runId) return

      const rect = imgEl.getBoundingClientRect()
      const scaleX = rect.width / imgEl.naturalWidth
      const scaleY = rect.height / imgEl.naturalHeight

      const nextCandidates: Record<number, {
        personId: number
        name: string
        distance: number
        confidence: number
        threshold: number
        confidenceLabel: 'high' | 'probable' | 'uncertain'
      } | null> = {}
      let faces: FaceDetection[] = []
      if (analysis.ok) {
        setActiveModelId(analysis.modelId)
        faces = analysis.faces.map((d) => {
          const b = d.box
          return {
            box: {
              x: b.x * scaleX,
              y: b.y * scaleY,
              width: b.width * scaleX,
              height: b.height * scaleY
            },
            descriptor: Array.from(d.descriptor)
          }
        })
        for (let i = 0; i < analysis.faces.length; i += 1) {
          const candidate = analysis.faces[i].candidate
          nextCandidates[i] = candidate
            ? {
                personId: candidate.personId,
                name: candidate.name,
                distance: candidate.distance,
                confidence: candidate.confidence,
                threshold: candidate.threshold,
                confidenceLabel: candidate.confidenceLabel
              }
            : null
        }
      } else {
        // זמינות: אם ONNX נכשל (למשל DLL על Windows), נאתר פרצופים עם מנוע legacy.
        // שמירת embedding תיחסם כדי לא לערבב embedding-space.
        faces = await detectFacesViaLegacy(imgEl, scaleX, scaleY)
        setActiveModelId(LEGACY_FACE_MODEL_ID)
        setModelsError(`ONNX לא זמין כרגע: ${analysis.error}`)
        for (let i = 0; i < faces.length; i += 1) nextCandidates[i] = null
      }

      setDetectedFaces(faces)
      setCandidateByIndex(nextCandidates)
      setFaceResolvedByIndex({})
      setNameDrafts((prev) => {
        // לא לשמור טיוטות של מזהים שכבר לא קיימים
        const next: Record<number, string> = {}
        for (let i = 0; i < faces.length; i += 1) {
          if (prev[i]) next[i] = prev[i]
        }
        return next
      })
      setModelsState('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setModelsState('error')
      setModelsError(msg)
      setImageError(`שגיאה בזיהוי פרצופים: ${msg}`)
      setDetectedFaces([])
      setNameDrafts({})
      setCandidateByIndex({})
      setFaceResolvedByIndex({})
    } finally {
      if (detectRunIdRef.current === runId) setIsDetecting(false)
    }
  }

  useEffect(() => {
    void refreshKnownTagData()
  }, [])

  useEffect(() => {
    if (!imagePath || isImageLoading) return
    void detectFacesForCurrentImage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagePath, imageSrc, isImageLoading])

  async function saveFaceWithName(faceIndex: number, personName: string, options?: { skipFolderPrompt?: boolean }) {
    if (!imagePath) return
    const n = normalizeTagName(personName)
    if (!n) {
      setImageError('נא להזין שם תקין לתגית.')
      return
    }
    const face = detectedFaces[faceIndex]
    if (!face) return
    let folderChoice: number | null | undefined = undefined
    if (!options?.skipFolderPrompt) {
      folderChoice = await promptTagFolderChoice(n, getKnownFolderIdByTagName(n))
      if (folderChoice === undefined) return
    }

    setImageError(null)
    setFaceSaving(true)
    try {
      await window.api.addTagToPath(imagePath, n)
      if (!options?.skipFolderPrompt) {
        await assignFolderByTagName(n, folderChoice ?? null)
      }
      if (activeModelId === FACE_EMBEDDING_MODEL_ID) {
        const r = await window.api.addFaceEmbedding({ name: n, descriptor: face.descriptor, modelId: activeModelId })
        if (!r.ok) {
          setImageError(r.error ?? 'שגיאה בשמירת embedding')
          return
        }
      } else {
        setImageError('התגית נשמרה, אך embedding לא נשמר כי ONNX לא זמין כרגע.')
      }
      await refreshKnownTagData()
      await onTagsChanged?.()

      setFaceSavedByIndex((prev) => ({ ...prev, [faceIndex]: n }))
      setCandidateByIndex((prev) => ({ ...prev, [faceIndex]: null }))
      setFaceResolvedByIndex((prev) => ({ ...prev, [faceIndex]: 'yes' }))
    } finally {
      setFaceSaving(false)
    }
  }

  function getPlannedNameForFace(faceIndex: number): string | null {
    const already = normalizeTagName(faceSavedByIndex[faceIndex] ?? '')
    if (already) return already
    const candidate = candidateByIndex[faceIndex]
    const resolved = faceResolvedByIndex[faceIndex]
    if (candidate && resolved !== 'no') {
      const n = normalizeTagName(candidate.name)
      if (n) return n
    }
    const draft = normalizeTagName(nameDrafts[faceIndex] ?? '')
    return draft || null
  }

  async function saveAllFaceTagsAndClear() {
    if (!imagePath) return
    if (detectedFaces.length === 0) {
      setImageError('לא זוהו פרצופים לשמירה בתמונה זו.')
      return
    }

    const toSave: { faceIndex: number; name: string }[] = []
    for (let i = 0; i < detectedFaces.length; i += 1) {
      const name = getPlannedNameForFace(i)
      if (name) toSave.push({ faceIndex: i, name })
    }

    if (toSave.length === 0) {
      setImageError('לא הוגדרו שמות לשמירה. הזן שם לפחות לפרצוף אחד.')
      return
    }

    const allowEmbedding = activeModelId === FACE_EMBEDDING_MODEL_ID
    const savedByIndex: Record<number, string> = {}
    let tagSaveErrors = 0
    let embeddingSaveErrors = 0

    setFaceSaving(true)
    setImageError(null)
    try {
      for (const item of toSave) {
        const face = detectedFaces[item.faceIndex]
        if (!face) continue

        try {
          // Always keep file tags usable, even when ONNX embedding storage is unavailable.
          // eslint-disable-next-line no-await-in-loop
          await window.api.addTagToPath(imagePath, item.name)
        } catch {
          tagSaveErrors += 1
          continue
        }

        if (allowEmbedding) {
          // eslint-disable-next-line no-await-in-loop
          const r = await window.api.addFaceEmbedding({
            name: item.name,
            descriptor: face.descriptor,
            modelId: activeModelId
          })
          if (!r.ok) {
            embeddingSaveErrors += 1
            continue
          }
        }

        savedByIndex[item.faceIndex] = item.name
      }

      setFaceSavedByIndex((prev) => ({ ...prev, ...savedByIndex }))

      if (Object.keys(savedByIndex).length === 0) {
        setImageError('שמירה נכשלה. נסה שוב.')
        return
      }

      if (!allowEmbedding) {
        setImageError('התגיות נשמרו לתמונה, אך embeddings לא נשמרו כי ONNX לא זמין כרגע.')
      } else if (embeddingSaveErrors > 0 || tagSaveErrors > 0) {
        setImageError(`השמירה הושלמה חלקית. תגיות שנכשלו: ${tagSaveErrors}, embeddings שנכשלו: ${embeddingSaveErrors}.`)
      }

      await refreshKnownTagData()
      await onTagsChanged?.()
      clearCurrentImage()
    } finally {
      setFaceSaving(false)
    }
  }

  async function handleSaveTagForFace(faceIndex: number) {
    const raw = nameDrafts[faceIndex] ?? ''
    await saveFaceWithName(faceIndex, raw)
  }

  const engineStatus = (() => {
    if (modelsState === 'loading') return { label: 'מנוע: טוען...', kind: 'loading' as const }
    if (modelsState === 'error') return { label: 'מנוע: שגיאה', kind: 'error' as const }
    if (activeModelId === FACE_EMBEDDING_MODEL_ID) return { label: 'מנוע: ONNX פעיל', kind: 'onnx' as const }
    return { label: 'מנוע: Fallback', kind: 'fallback' as const }
  })()

  function faceConfidenceUi(faceIndex: number): {
    label: string
    kind: 'high' | 'probable' | 'uncertain' | 'unrecognized'
    percent: string
  } {
    const candidate = candidateByIndex[faceIndex]
    if (!candidate) return { label: 'לא מזוהה', kind: 'unrecognized', percent: '0%' }
    const percent = Math.max(0, Math.min(1, candidate.confidence))
    const pctText = `${Math.round(percent * 100)}%`
    if (percent >= 0.9) return { label: 'זיהוי בטוח', kind: 'high', percent: pctText }
    if (percent >= 0.7) return { label: 'כנראה', kind: 'probable', percent: pctText }
    if (percent >= 0.5) return { label: 'לא בטוח', kind: 'uncertain', percent: pctText }
    return { label: 'לא מזוהה', kind: 'unrecognized', percent: pctText }
  }

  return (
    <div className="face-recognition-tab">
      <p className="muted small" style={{ marginTop: 0 }}>
        העלו תמונה כדי לזהות פרצופים ולהוסיף תגיות לפי שמות.
      </p>
      <div className="toolbar">
        <button
          type="button"
          className="btn primary"
          onClick={() => void pickImage()}
          disabled={isDetecting || faceSaving}
        >
          בחר תמונה
        </button>
        {imagePath && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void saveAllFaceTagsAndClear()}
            disabled={isDetecting || faceSaving || detectedFaces.length === 0}
          >
            שמירת תגיות
          </button>
        )}
        {imagePath && (
          <button
            type="button"
            className="btn"
            onClick={clearCurrentImage}
            disabled={isDetecting || faceSaving}
          >
            נקה
          </button>
        )}
        <span className={`engine-status-badge ${engineStatus.kind}`}>{engineStatus.label}</span>
      </div>

      {(imageError || modelsError) && (
        <p className="muted" style={{ color: 'var(--danger)', marginTop: 0 }}>
          {imageError ?? modelsError}
        </p>
      )}

      {imagePath ? (
        <>
          <div className="face-workspace">
              <div className="face-labels">
                {modelsState === 'ready' && detectedFaces.length > 0 ? (
                detectedFaces.map((_, idx) => {
                  const savedName = faceSavedByIndex[idx]
                  const candidate = candidateByIndex[idx]
                  const resolved = faceResolvedByIndex[idx]
                  const confidenceUi = faceConfidenceUi(idx)

                  if (savedName) {
                    return (
                      <div key={idx} className="face-label-item">
                        <div
                          onMouseEnter={() => setActiveFaceIndex(idx)}
                          onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                          onFocusCapture={() => setActiveFaceIndex(idx)}
                          onBlurCapture={(e) => {
                            const next = e.relatedTarget as Node | null
                            if (!next || !e.currentTarget.contains(next)) {
                              setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                            }
                          }}
                        >
                        <div className="face-label-text">
                          <span className="muted small">פרצוף {idx + 1}</span>
                          <span className="muted small">נשמר כ-{savedName}</span>
                          <span className={`confidence-badge ${confidenceUi.kind}`}>
                            {confidenceUi.label} ({confidenceUi.percent})
                          </span>
                        </div>
                        </div>
                      </div>
                    )
                  }

                  const hasCandidate = !!candidate
                  const inCandidatePrompt = hasCandidate && resolved !== 'no'

                  if (inCandidatePrompt && candidate) {
                    return (
                      <div key={idx} className="face-label-item">
                        <div
                          onMouseEnter={() => setActiveFaceIndex(idx)}
                          onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                          onFocusCapture={() => setActiveFaceIndex(idx)}
                          onBlurCapture={(e) => {
                            const next = e.relatedTarget as Node | null
                            if (!next || !e.currentTarget.contains(next)) {
                              setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                            }
                          }}
                        >
                        <div className="face-label-text">
                          <span className="muted small">פרצוף {idx + 1}</span>
                          <span className="muted small">
                            נראה כמו {candidate.name} (דיוק: {(candidate.confidence * 100).toFixed(0)}%)
                          </span>
                          <span className={`confidence-badge ${confidenceUi.kind}`}>
                            {confidenceUi.label} ({confidenceUi.percent})
                          </span>
                          <span className="muted small">האם זה אותו אדם?</span>
                        </div>
                        <div className="face-label-row">
                          <input
                            value={candidate.name}
                            readOnly
                            style={{ flex: 1, minWidth: 160, background: 'rgba(26, 26, 46, 0.35)' }}
                          />
                          <button
                            type="button"
                            className="btn primary"
                            disabled={faceSaving}
                            onClick={() => void saveFaceWithName(idx, candidate.name, { skipFolderPrompt: true })}
                          >
                            כן
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={faceSaving}
                            onClick={() => {
                              setFaceResolvedByIndex((prev) => ({ ...prev, [idx]: 'no' }))
                              setNameDrafts((prev) => ({ ...prev, [idx]: '' }))
                            }}
                          >
                            לא
                          </button>
                        </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={idx} className="face-label-item">
                      <div
                        onMouseEnter={() => setActiveFaceIndex(idx)}
                        onMouseLeave={() => setActiveFaceIndex((prev) => (prev === idx ? null : prev))}
                        onFocusCapture={() => setActiveFaceIndex(idx)}
                        onBlurCapture={(e) => {
                          const next = e.relatedTarget as Node | null
                          if (!next || !e.currentTarget.contains(next)) {
                            setActiveFaceIndex((prev) => (prev === idx ? null : prev))
                          }
                        }}
                      >
                      <div className="face-label-text">
                        <span className="muted small">פרצוף {idx + 1}</span>
                        <span className="muted small">הזן שם ושמור</span>
                        <span className={`confidence-badge ${confidenceUi.kind}`}>
                          {confidenceUi.label} ({confidenceUi.percent})
                        </span>
                      </div>
                      <div className="face-label-row">
                        <input
                          value={nameDrafts[idx] ?? ''}
                          onChange={(e) => setNameDrafts((prev) => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="שם"
                          style={{ flex: 1, minWidth: 160 }}
                          disabled={faceSaving}
                        />
                        <button
                          type="button"
                          className="btn primary"
                          disabled={faceSaving}
                          onClick={() => void handleSaveTagForFace(idx)}
                        >
                          שמור תגית
                        </button>
                      </div>
                      </div>
                    </div>
                  )
                })
                ) : (
                  <div className="face-label-item">
                    <div className="face-label-text">
                      <span className="muted small">שדות זיהוי יופיעו כאן לאחר סיום הזיהוי.</span>
                    </div>
                  </div>
                )}
              </div>

            <div className="face-image-preview">
              <div className="face-image-frame">
                {imageSrc && (
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    onError={() => {
                      setImageError('טעינת תמונה נכשלה')
                      setDetectedFaces([])
                      setNameDrafts({})
                    }}
                  />
                )}
                <div className="face-image-overlay">
                  {isImageLoading && <span className="face-image-overlay-text">טוען תמונה</span>}
                  {!isImageLoading && isDetecting && <span className="face-image-overlay-text">מזהה...</span>}
                  {!isDetecting && detectedFaces.length === 0 && modelsState === 'ready' && (
                    <span className="face-image-overlay-text">לא זוהו פרצופים בתמונה</span>
                  )}
                  {detectedFaces.map((f, idx) => (
                    <div
                      key={idx}
                      className={`face-box ${activeFaceIndex === idx ? 'active' : ''}`}
                      style={{
                        left: f.box.x,
                        top: f.box.y,
                        width: f.box.width,
                        height: f.box.height
                      }}
                    >
                      <span className="face-box-index">{idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {modelsState === 'loading' && (
            <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              טוען מודלים...
            </p>
          )}
          {modelsState === 'error' && (
            <p className="muted small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              לא ניתן לנתח את התמונה. ודא שמודלי ONNX קיימים בתיקיית `resources/models/face` וש־Microsoft Visual C++ Redistributable
              (x64) מותקן במערכת.
            </p>
          )}

        </>
      ) : (
        <p className="muted small" style={{ marginBottom: 0 }}>
          עדיין לא נבחרה תמונה.
        </p>
      )}
      {tagFolderPicker.open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeTagFolderPicker(undefined)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <strong>שיוך תגית לתיקייה</strong>
            <p className="muted small" style={{ marginBottom: '0.5rem' }}>
              תגית: <strong>{tagFolderPicker.tagName}</strong>
            </p>
            <div className="field">
              <label>בחר תיקייה</label>
              <select
                value={tagFolderPicker.selectedFolderId}
                onChange={(e) => setTagFolderPicker((prev) => ({ ...prev, selectedFolderId: e.target.value }))}
              >
                <option value="">ללא תיקייה</option>
                {knownTagFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => closeTagFolderPicker(tagFolderPicker.selectedFolderId ? Number(tagFolderPicker.selectedFolderId) : null)}
              >
                אישור
              </button>
              <button type="button" className="btn" onClick={() => closeTagFolderPicker(undefined)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TagRenameRow({
  tag,
  folderId,
  folders,
  onAssignFolder,
  onChanged
}: {
  tag: TagRow
  folderId: number | null
  folders: TagFolderRow[]
  onAssignFolder: (folderId: string) => void
  onChanged: () => void
}) {
  const [name, setName] = useState(tag.name)
  useEffect(() => setName(tag.name), [tag.name])

  async function save() {
    if (name.trim() === tag.name) return
    const res = await window.api.renameTag(tag.id, name.trim())
    if (!res.ok) alert(res.error)
    onChanged()
  }

  async function del() {
    if (!confirm(`למחוק את התגית "${tag.name}" מכל המקומות?`)) return
    await window.api.deleteTag(tag.id)
    onChanged()
  }

  return (
    <tr>
      <td>{tag.name}</td>
      <td>
        <select value={folderId ?? ''} onChange={(e) => onAssignFolder(e.target.value)}>
          <option value="">ללא תיקייה</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} />
      </td>
      <td>
        <button type="button" className="btn danger" onClick={() => void del()}>
          מחק
        </button>
      </td>
    </tr>
  )
}
