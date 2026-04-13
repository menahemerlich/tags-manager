import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  BlurParams,
  BlurSelection,
  ImportConflictChoice,
  PathKind,
  SearchResultRow,
  TransferPackageProgress,
  TagFolderRow,
  TagImportPreview,
  TagRow,
} from '../../shared/types'
import { normalizeTagName } from '../../shared/tagNormalize'
import {
  createBlurPreviewSource,
  createBlurredPreviewImageData,
  renderBlurPreviewDataUrl,
  type BlurPreviewSource
} from './blurProcessor'
import type { Tab, FaceTab } from './app/appTabs'
import { AppTopBar } from './app/AppTopBar'
import { AppOverlays } from './app/AppOverlays'
import { getFolderAccentStyle, type FolderAccentStyle } from './app/folderAccent'
import { AppFooter } from './app/AppFooter'
import { AppMainPanels } from './app/AppMainPanels'
import { transferProgressPercentFromStage } from './app/transferProgressUi'
import type { SettingsView } from './app/panels/SettingsTabPanel'
import { applySearchResultClientFilters } from './pages/Search/applySearchResultClientFilters'
import {
  createEmptySearchResultShapeSelection,
  type SearchResultShapeId
} from './pages/Search/searchResultShapeFilter'


/** שורש האפליקציה: ניווט טאבים, ספרייה, חיפוש, תגיות, הגדרות, פרצופים וסימן מים */
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
  /** סינון תוצאות חיפוש: תיקיות / תמונות / וידאו / מסמכים / אחר (ריק = הכל). */
  const [searchContentFilterSelection, setSearchContentFilterSelection] = useState<
    Set<SearchResultShapeId>
  >(() => createEmptySearchResultShapeSelection())
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([])
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedSearchPath, setSelectedSearchPath] = useState<string | null>(null)
  const [selectedSearchDirectTags, setSelectedSearchDirectTags] = useState<string[]>([])
  const [searchFileTagDraft, setSearchFileTagDraft] = useState('')
  const [settingsView, setSettingsView] = useState<SettingsView>('updates')
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

  const transferProgressPercent = transferProgressPercentFromStage(transferProgress)

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

  const toggleSearchContentShape = useCallback((id: SearchResultShapeId) => {
    setSearchContentFilterSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (id === 'folders') {
        return new Set<SearchResultShapeId>(['folders'])
      }
      next.delete('folders')
      next.add(id)
      return next
    })
  }, [])

  const searchResultsFiltered = useMemo(
    () =>
      applySearchResultClientFilters(searchResults, {
        scopePath: searchScope,
        contentShapes: searchContentFilterSelection
      }),
    [searchResults, searchScope, searchContentFilterSelection]
  )

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
      <AppTopBar appVersion={appVersion} tab={tab} setTab={setTab} />

      <AppMainPanels
        tab={tab}
        error={error}
        library={{
          librarySelectedItems,
          libraryTags,
          libraryTagDraft,
          setLibraryTagDraft,
          libraryFolderSuggestions,
          tags,
          tagFolders,
          expandedLibraryFolderIds,
          setExpandedLibraryFolderIds,
          folderIdByTagId,
          onPickFiles: handlePickFiles,
          onPickFolders: handlePickFolders,
          onOpenInWatermark: openPreviewInWatermarkTab,
          onOpenInFaces: openPreviewInFacesTab,
          requestAddLibraryTag,
          removeLibraryTag,
          getTagClassName,
          getTagAccentStyle,
          formatTagLabel,
          onSaveAndDone: handleLibrarySaveAndDone,
          onCancel: handleLibraryCancel
        }}
        search={{
          searchScope,
          setSearchScope,
          searchContentFilterSelection,
          toggleSearchContentShape,
          searchDraft,
          setSearchDraft,
          searchSelected,
          searchTruncated,
          searchLoading,
          searchResultsFiltered,
          selectedSearchPath,
          setSelectedSearchPath,
          selectedSearchDirectTags,
          searchFileTagDraft,
          setSearchFileTagDraft,
          tags,
          tagFolders,
          expandedSearchFolderIds,
          setExpandedSearchFolderIds,
          folderIdByTagId,
          onPickSearchScope: handlePickSearchScope,
          onRefreshSearchTagData: refreshSearchTagData,
          addToSearchQuery,
          removeSearchTag,
          toggleQuickSearchTag,
          getTagClassName,
          getTagAccentStyle,
          formatTagLabel,
          onOpenInWatermark: openPreviewInWatermarkTab,
          onOpenInFaces: openPreviewInFacesTab,
          handleSelectSearchResult,
          setSearchTagsModal,
          addTagToSearchFile,
          removeTagFromSearchFile
        }}
        tags={{
          newTagFolderName,
          setNewTagFolderName,
          createTagFolder,
          tagFolders,
          tags,
          expandedTagFolderIds,
          setExpandedTagFolderIds,
          openTagFolderMenuId,
          setOpenTagFolderMenuId,
          folderIdByTagId,
          deleteTagFolder,
          assignTagToFolder,
          onTagsChanged: async () => {
            await refreshTags()
            await refreshTagFolders()
          }
        }}
        settings={{
          settingsView,
          setSettingsView,
          tagIoScopePath,
          setTagIoScopePath,
          setImportPreview,
          setTagIoMsg,
          importPreview,
          importDefaultChoice,
          setImportDefaultChoice,
          importChoicesByPath,
          setImportChoicesByPath,
          importApplying,
          tagIoMsg,
          chooseTagIoScope,
          handleExportTagsJson,
          handleImportPreview,
          handleApplyImport,
          transferMsg,
          transferRevealPath,
          isPackagingTransfer,
          isImportingUserData,
          transferBuildChoiceOpen,
          setTransferBuildChoiceOpen,
          setTransferMsg,
          setTransferProgress,
          transferProgress,
          transferProgressPercent,
          handlePackageForTransfer,
          handleImportUserDataFromBackup
        }}
        refreshSearchTagData={refreshSearchTagData}
        faceOpenFromPreview={faceOpenFromPreview}
        onFaceOpenFromPreviewHandled={onFaceOpenFromPreviewHandled}
        watermarkOpenFromPreview={watermarkOpenFromPreview}
        onWatermarkOpenFromPreviewHandled={onWatermarkOpenFromPreviewHandled}
      />

      <AppOverlays
        indexing={indexing}
        onCancelIndex={handleCancelIndex}
        importApplying={importApplying}
        importProgress={importProgress}
        tagFolderPicker={tagFolderPicker}
        tagFolders={tagFolders}
        setTagFolderPicker={setTagFolderPicker}
        closeTagFolderPicker={closeTagFolderPicker}
        searchTagsModal={searchTagsModal}
        setSearchTagsModal={setSearchTagsModal}
        getTagClassName={getTagClassName}
        getTagAccentStyle={getTagAccentStyle}
        formatTagLabel={formatTagLabel}
      />


      <AppFooter />
    </div>
  )
}
