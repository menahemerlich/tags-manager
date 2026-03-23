import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PathKind, SearchResultRow, TagRow } from '../../shared/types'
import { normalizeTagName } from '../../shared/tagNormalize'

type Tab = 'library' | 'search' | 'tags' | 'settings'

function kindHe(kind: PathKind): string {
  return kind === 'folder' ? 'תיקייה' : 'קובץ'
}

export default function App() {
  const [tab, setTab] = useState<Tab>('library')
  const [librarySelectedItems, setLibrarySelectedItems] = useState<{ path: string; kind: PathKind }[] | null>(null)
  const [libraryTags, setLibraryTags] = useState<string[]>([])
  const [libraryTagDraft, setLibraryTagDraft] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [searchSelected, setSearchSelected] = useState<string[]>([])
  const [searchDraft, setSearchDraft] = useState('')
  const [searchScope, setSearchScope] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([])
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [selectedSearchPath, setSelectedSearchPath] = useState<string | null>(null)
  const [selectedSearchDirectTags, setSelectedSearchDirectTags] = useState<string[]>([])
  const [searchFileTagDraft, setSearchFileTagDraft] = useState('')
  const [settingsRepo, setSettingsRepo] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [indexing, setIndexing] = useState<{ done: number; total: number; currentPath: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshTags = useCallback(async () => {
    const list = await window.api.listTags()
    setTags(list)
  }, [])

  useEffect(() => {
    void refreshTags()
    void window.api.getAppVersion().then(setAppVersion)
    void window.api.getSettings().then((s) => setSettingsRepo(s.githubRepo))
  }, [refreshTags])

  useEffect(() => {
    const off = window.api.onIndexProgress((p) => {
      setIndexing(p)
      if (p.total > 0 && p.done >= p.total) {
        setTimeout(() => setIndexing(null), 150)
      }
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
      setLibraryTags([...allTags].sort((a, b) => a.localeCompare(b)))
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
      setLibraryTags([...allTags].sort((a, b) => a.localeCompare(b)))
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
      setLibraryTagDraft('')
      await refreshTags()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIndexing(null)
    }
  }

  function handleLibraryCancel() {
    setLibrarySelectedItems(null)
    setLibraryTags([])
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
    const res = await window.api.search(searchSelected)
    setSearchResults(res.rows)
    setSearchTruncated(res.truncated ?? false)
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

  async function addTagToSearchFile(tagName: string) {
    if (!selectedSearchPath) return
    const n = normalizeTagName(tagName)
    if (!n) return
    if (selectedSearchDirectTags.some((t) => t.toLowerCase() === n.toLowerCase())) return
    setError(null)
    await window.api.addTagToPath(selectedSearchPath, n)
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
        <h1>מנהל תגיות</h1>
        <nav className="nav">
          {(
            [
              ['library', 'ספרייה'],
              ['search', 'חיפוש'],
              ['tags', 'תגיות'],
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
                        e.key === 'Enter' && (e.preventDefault(), addLibraryTag(libraryTagDraft), setLibraryTagDraft(''))
                      }
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => (addLibraryTag(libraryTagDraft), setLibraryTagDraft(''))}
                    >
                      הוסף תגית
                    </button>
                  </div>
                  {libraryTags.length > 0 && (
                    <div className="tags" style={{ marginTop: '0.5rem' }}>
                      {libraryTags.map((t) => (
                        <span key={t} className="tag">
                          {t}
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
                              onClick={() => addLibraryTag(s)}
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
                      <div className="chips">
                        {tags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={libraryTags.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? 'chip on' : 'chip'}
                            onClick={() => addLibraryTag(t.name)}
                            title={libraryTags.includes(t.name) ? 'כבר קיים' : 'הוסף'}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
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
                      {t}
                      <button type="button" className="x" title="הסר מחיפוש" onClick={() => removeSearchTag(t)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="muted small">בחירה מהירה מתוך תגיות קיימות במערכת:</p>
            <div className="chips">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={searchSelected.includes(t.name) ? 'chip on' : 'chip'}
                  onClick={() => toggleQuickSearchTag(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {tags.length === 0 && <p className="muted">אין עדיין תגיות. הוסיפו קבצים או תיקיות מהספרייה.</p>}
            {searchTruncated && (
              <p className="muted small" style={{ marginBottom: '0.5rem' }}>
                מוצגות 5,000 התוצאות הראשונות. צמצם את החיפוש או הוסף תגיות.
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
                      onClick={() => void window.api.openPath(row.path)}
                      style={{ cursor: 'pointer' }}
                      title="פתח קובץ"
                    >
                      <td className="path-cell">{row.path}</td>
                      <td>
                        <div className="tags">
                          {row.tags.map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
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
                      {t}
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
                      (e.preventDefault(), addTagToSearchFile(searchFileTagDraft), setSearchFileTagDraft(''))
                    }
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => (addTagToSearchFile(searchFileTagDraft), setSearchFileTagDraft(''))}
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
                          onClick={() => addTagToSearchFile(t.name)}
                        >
                          {t.name}
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>תגית</th>
                    <th>שינוי שם</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tags.map((t) => (
                    <TagRenameRow key={t.id} tag={t} onChanged={() => void refreshTags()} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="panel">
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
            <p className="muted small">
              הבדיקה משתמשת ב־API הציבורי של GitHub לגרסה האחרונה. אם יש גרסה חדשה (לפי מספור semver),
              ייפתח דף השחרור בדפדפן.
            </p>
            <p className="muted small" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              <strong>כוננים חיצוניים:</strong> הנתיבים נשמרים כמוחלטים (כולל אות כונן). אם דיסק USB מקבל אות
              אחר, ייתכן שתצטרכו לבחור מחדש או להוסיף שוב את התיקיות — תכונה להחלפת נתיב גלובלית תתווסף
              בעתיד אם יידרש.
            </p>
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
    </div>
  )
}

function TagRenameRow({ tag, onChanged }: { tag: TagRow; onChanged: () => void }) {
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
