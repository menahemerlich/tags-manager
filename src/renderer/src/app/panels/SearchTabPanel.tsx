import type { Dispatch, SetStateAction } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import type { SearchResultRow, TagFolderRow, TagRow } from '../../../../shared/types'
import { FilePreview } from '../../components/FilePreview'
import { getFolderAccentStyle, type FolderAccentStyle } from '../folderAccent'
import {
  SEARCH_RESULT_SHAPE_LABEL,
  SEARCH_RESULT_SHAPE_ORDER,
  type SearchResultShapeId
} from '../../pages/Search/searchResultShapeFilter'

export type SearchTabPanelProps = {
  searchScope: string | null
  setSearchScope: (v: string | null) => void
  searchContentFilterSelection: ReadonlySet<SearchResultShapeId>
  toggleSearchContentShape: (id: SearchResultShapeId) => void
  searchDraft: string
  setSearchDraft: (v: string) => void
  searchSelected: string[]
  searchTruncated: boolean
  searchLoading: boolean
  searchResultsFiltered: SearchResultRow[]
  selectedSearchPath: string | null
  setSelectedSearchPath: (v: string | null) => void
  selectedSearchDirectTags: string[]
  searchFileTagDraft: string
  setSearchFileTagDraft: (v: string) => void
  tags: TagRow[]
  tagFolders: TagFolderRow[]
  expandedSearchFolderIds: Record<number, boolean>
  setExpandedSearchFolderIds: Dispatch<SetStateAction<Record<number, boolean>>>
  folderIdByTagId: Map<number, number>
  onPickSearchScope: () => void | Promise<void>
  onRefreshSearchTagData: () => void | Promise<void>
  addToSearchQuery: () => void
  removeSearchTag: (name: string) => void
  toggleQuickSearchTag: (name: string) => void
  getTagClassName: (tagName: string, baseClass: 'tag' | 'chip', isActive?: boolean) => string
  getTagAccentStyle: (tagName: string) => FolderAccentStyle | undefined
  formatTagLabel: (name: string) => string
  onOpenInWatermark: (path: string) => void
  onOpenInFaces: (path: string) => void
  handleSelectSearchResult: (path: string) => void | Promise<void>
  setSearchTagsModal: (v: { open: boolean; path: string; tags: string[] }) => void
  addTagToSearchFile: (tagName: string, withFolderPrompt?: boolean) => void | Promise<void>
  removeTagFromSearchFile: (tagName: string) => void | Promise<void>
}

/** טאב חיפוש לפי תגיות, טבלת תוצאות ועריכת תגיות לקובץ נבחר */
export function SearchTabPanel({
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
  onPickSearchScope,
  onRefreshSearchTagData,
  addToSearchQuery,
  removeSearchTag,
  toggleQuickSearchTag,
  getTagClassName,
  getTagAccentStyle,
  formatTagLabel,
  onOpenInWatermark,
  onOpenInFaces,
  handleSelectSearchResult,
  setSearchTagsModal,
  addTagToSearchFile,
  removeTagFromSearchFile
}: SearchTabPanelProps) {
  const foldersOnly = searchContentFilterSelection.has('folders')
  const querySummary =
    searchSelected.length > 0 ? searchSelected.map((t) => formatTagLabel(t)).join(' · ') : '—'

  return (
    <section className="panel search-panel">
      <div className="search-page-layout">
        <aside className="search-sidebar" aria-label="סינון וחיפוש">
          <div className="search-sidebar-section field">
            <label>חיפוש בתוך (אופציונלי)</label>
            <div className="toolbar search-scope-toolbar">
              <input
                readOnly
                className="path-ltr-isolate search-sidebar-input search-scope-path-input"
                value={searchScope ?? 'כל הנתיבים'}
                title={searchScope ?? ''}
              />
              <button type="button" className="btn primary" onClick={() => void onPickSearchScope()}>
                בחר תיקייה/כונן
              </button>
              {searchScope && (
                <button type="button" className="btn" onClick={() => setSearchScope(null)}>
                  נקה
                </button>
              )}
            </div>
          </div>
          <div className="search-sidebar-section field">
            <label>סינון תוצאות</label>
            <div className="search-shape-filters" role="group" aria-label="סינון לפי סוג תוכן">
              {SEARCH_RESULT_SHAPE_ORDER.map((id) => {
                const disabled = foldersOnly && id !== 'folders'
                return (
                  <label
                    key={id}
                    className={`search-shape-filter-option${disabled ? ' is-disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={searchContentFilterSelection.has(id)}
                      disabled={disabled}
                      onChange={() => toggleSearchContentShape(id)}
                    />
                    <span>{SEARCH_RESULT_SHAPE_LABEL[id]}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="search-sidebar-section field">
            <label>תגיות</label>
            <div className="search-tag-query-row">
              <div className="search-tag-query-field">
                <span className="search-tag-query-icon" aria-hidden>
                  🔍
                </span>
                <input
                  className="search-sidebar-input search-tag-query-input"
                  placeholder="חיפוש תגית…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToSearchQuery())}
                />
              </div>
              <button type="button" className="btn primary search-tag-query-btn" onClick={addToSearchQuery}>
                הוסף
              </button>
              <button
                type="button"
                className="btn search-tag-refresh-btn"
                title="רענון רשימת התגיות"
                aria-label="רענון רשימת התגיות"
                onClick={() => void onRefreshSearchTagData()}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                  className="search-tag-refresh-svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
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
          <p className="muted small" style={{ marginBottom: '0.35rem' }}>
            בחירה מהירה מתוך תגיות קיימות במערכת:
          </p>
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
          <div className="chips" style={{ marginBottom: '0.35rem' }}>
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
          {tags.length === 0 && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              אין עדיין תגיות. הוסיפו קבצים או תיקיות מהספרייה.
            </p>
          )}
        </aside>

        <div className="search-results-column">
          <div className="search-results-card">
            <h2 className="search-results-title">תוצאות חיפוש עבור: {querySummary}</h2>
            <p className="muted small search-results-subtitle">
              קבצים ותיקיות עם <strong>כל</strong> התגיות שנבחרו. ללא תגיות לא יוצגו תוצאות. סינון תחום וסוג — בפאנל
              הימני.
            </p>
            {searchTruncated && (
              <p className="muted small search-results-banner">
                מוצגות 5,000 התוצאות הראשונות. צמצמו חיפוש או הוסיפו תגיות.
              </p>
            )}
            {searchSelected.length > 0 && !searchTruncated && !searchLoading && searchResultsFiltered.length === 0 && (
              <p className="muted small search-results-banner">אין תוצאות.</p>
            )}
            {searchLoading && <p className="muted small search-results-banner">מחפש…</p>}
            <div className="search-results-table-shell">
              <div className="table-wrap search-results-table-wrap">
                <TableVirtuoso
                  data={searchResultsFiltered}
                  fixedHeaderContent={() => (
                    <tr>
                      <th className="search-col-thumb">תמונה ממוזערת</th>
                      <th>נתיב</th>
                      <th>תגיות</th>
                      <th className="search-col-actions">פעולות</th>
                    </tr>
                  )}
                components={{
                  TableRow: ({ item, children, style, ...rowProps }) => (
                    <tr {...rowProps} style={style} className={selectedSearchPath === item.path ? 'selected' : ''}>
                      {children}
                    </tr>
                  )
                }}
                itemContent={(_index, row) => (
                  <>
                    <td className="search-col-thumb-cell">
                      <FilePreview
                        key={row.path}
                        filePath={row.path}
                        pathKind={row.kind}
                        onOpenInWatermark={onOpenInWatermark}
                        onOpenInFaces={onOpenInFaces}
                      />
                    </td>
                    <td className="path-cell">
                      <button
                        type="button"
                        className="path-open-btn"
                        onClick={() => void window.api.openPath(row.path)}
                        title="פתח ב־Explorer"
                      >
                        {row.path}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small-btn"
                        onClick={() => setSearchTagsModal({ open: true, path: row.path, tags: row.tags })}
                      >
                        הצג תגיות
                      </button>
                    </td>
                    <td className="search-actions-cell">
                      <div className="search-result-actions-inline" role="group" aria-label="פעולות על הקובץ">
                        <button
                          type="button"
                          className="btn search-result-action-icon-btn"
                          onClick={() => void handleSelectSearchResult(row.path)}
                          title="ערוך תגיות"
                          aria-label="ערוך תגיות"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="btn search-result-action-icon-btn"
                          onClick={() => window.api.showInFolder(row.path)}
                          title="הצג בסייר הקבצים"
                          aria-label="הצג בסייר הקבצים"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedSearchPath && (
        <div
          className="overlay"
          style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem' }}
          onClick={(e) => e.target === e.currentTarget && setSelectedSearchPath(null)}
        >
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
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
  )
}
