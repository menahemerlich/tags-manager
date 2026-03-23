import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  FaceDetection,
  ImportConflictChoice,
  PathKind,
  SearchResultRow,
  TagFolderRow,
  TagImportPreview,
  TagRow
} from '../../shared/types'
import { FACE_EMBEDDING_MODEL_ID } from '../../shared/types'
import { normalizeTagName } from '../../shared/tagNormalize'
import * as faceapi from 'face-api.js'
import '@tensorflow/tfjs-backend-cpu'

type Tab = 'library' | 'search' | 'tags' | 'settings'

type FaceTab = 'faces'

function kindHe(kind: PathKind): string {
  return kind === 'folder' ? 'תיקייה' : 'קובץ'
}

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
  const [settingsRepo, setSettingsRepo] = useState('')
  const [settingsView, setSettingsView] = useState<'updates' | 'io' | 'about'>('updates')
  const [appVersion, setAppVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [tagIoScopePath, setTagIoScopePath] = useState<string | null>(null)
  const [tagIoMsg, setTagIoMsg] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<TagImportPreview | null>(null)
  const [importDefaultChoice, setImportDefaultChoice] = useState<ImportConflictChoice>('skip')
  const [importChoicesByPath, setImportChoicesByPath] = useState<Record<string, ImportConflictChoice>>({})
  const [importApplying, setImportApplying] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [indexing, setIndexing] = useState<{ done: number; total: number; currentPath: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    void window.api.getSettings().then((s) => setSettingsRepo(s.githubRepo))
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

  async function assignTagToFolder(tagId: number, folderIdRaw: string) {
    const folderId = folderIdRaw ? Number(folderIdRaw) : null
    const res = await window.api.setTagFolderForTag(tagId, folderId)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refreshTagFolders()
  }

  async function saveSettings() {
    setError(null)
    await window.api.setSettings({ githubRepo: settingsRepo.trim() })
    setUpdateMsg('ההגדרות נשמרו.')
    setTimeout(() => setUpdateMsg(null), 2000)
  }

  async function checkUpdates() {
    setError(null)
    setUpdateMsg(null)
    const r = await window.api.checkUpdates()
    if (r.error) {
      setError(r.error)
      return
    }
    if (r.isNewer && r.latestVersion && r.releaseUrl) {
      setUpdateMsg(`קיימת גרסה חדשה: ${r.latestVersion} (מותקן: ${r.currentVersion})`)
      window.open(r.releaseUrl, '_blank')
    } else {
      setUpdateMsg(`אין עדכון — הגרסה המותקנת היא העדכנית (${r.currentVersion}).`)
    }
  }

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
                      {item.path} <span className="muted">({kindHe(item.kind)})</span>
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
                        <span key={t} className="tag">
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
                            className={libraryTags.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? 'chip on' : 'chip'}
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
                                className={libraryTags.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? 'chip on' : 'chip'}
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
              </div>
            </div>
            {searchSelected.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <span className="muted small">תגיות פעילות בחיפוש:</span>
                <div className="tags" style={{ marginTop: '0.35rem' }}>
                  {searchSelected.map((t) => (
                    <span key={t} className="tag">
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
                    className={searchSelected.includes(t.name) ? 'chip on' : 'chip'}
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
                      className={searchSelected.includes(t.name) ? 'chip on' : 'chip'}
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>קובץ</th>
                    <th>תגיות</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {searchResultsFiltered.map((row) => (
                    <tr
                      key={row.path}
                      className={selectedSearchPath === row.path ? 'selected' : ''}
                    >
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
                              <span key={t} className="tag">
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
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <span key={t} className="tag">
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
                          className={
                            selectedSearchDirectTags.some((x) => x.toLowerCase() === t.name.toLowerCase())
                              ? 'chip on'
                              : 'chip'
                          }
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
                  <button
                    key={folder.id}
                    type="button"
                    className={`chip folder-chip ${expandedTagFolderIds[folder.id] ? 'on' : ''}`}
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
                <div key={folder.id} className="table-wrap" style={{ marginBottom: '0.75rem' }}>
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
            <FaceRecognitionTab />
          </section>
        )}

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
                className={settingsView === 'about' ? 'btn primary' : 'btn'}
                onClick={() => setSettingsView('about')}
              >
                הסבר על האפליקציה
              </button>
            </div>

            {settingsView === 'updates' && (
              <>
                <div className="field">
                  <label htmlFor="gh-repo">מאגר GitHub לעדכונים (בעלים/שם)</label>
                  <input
                    id="gh-repo"
                    value={settingsRepo}
                    onChange={(e) => setSettingsRepo(e.target.value)}
                    placeholder="למשל: user/tags-manager"
                  />
                </div>
                <div className="toolbar">
                  <button type="button" className="btn primary" onClick={() => void saveSettings()}>
                    שמור הגדרות
                  </button>
                  <button type="button" className="btn" onClick={() => void checkUpdates()}>
                    בדוק עדכונים
                  </button>
                </div>
                {updateMsg && <p className="muted">{updateMsg}</p>}
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  הבדיקה משתמשת ב־API הציבורי של GitHub לגרסה האחרונה. אם יש גרסה חדשה (לפי מספור semver),
                  ייפתח דף השחרור בדפדפן.
                </p>
                <p className="muted small" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <strong>כוננים חיצוניים:</strong> הנתיבים נשמרים כמוחלטים (כולל אות כונן). אם דיסק USB מקבל אות
                  אחר, ייתכן שתצטרכו לבחור מחדש או להוסיף שוב את התיקיות — תכונה להחלפת נתיב גלובלית תתווסף
                  בעתיד אם יידרש.
                </p>
              </>
            )}

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
                <span key={t} className="tag">
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

function FaceRecognitionTab() {
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
      const uri = '/face-models'
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

  async function pickImage() {
    setImageError(null)
    const image = await window.api.pickImage()
    if (!image) return
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
