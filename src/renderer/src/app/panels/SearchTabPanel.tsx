import type { Dispatch, SetStateAction } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import type { SearchResultRow, TagFolderRow, TagRow } from '../../../../shared/types'
import { FilePreview } from '../../components/FilePreview'
import { getFolderAccentStyle, type FolderAccentStyle } from '../folderAccent'

export type SearchTabPanelProps = {
  searchScope: string | null
  setSearchScope: (v: string | null) => void
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
  return (
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
          <button type="button" className="btn" onClick={() => void onPickSearchScope()}>
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
          <button type="button" className="btn" onClick={() => void onRefreshSearchTagData()}>
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
          components={{
            TableRow: ({ item, children, style, ...rowProps }) => (
              <tr {...rowProps} style={style} className={selectedSearchPath === item.path ? 'selected' : ''}>
                {children}
              </tr>
            )
          }}
          itemContent={(_index, row) => (
            <>
              <td>
                <FilePreview
                  key={row.path}
                  filePath={row.path}
                  onOpenInWatermark={onOpenInWatermark}
                  onOpenInFaces={onOpenInFaces}
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
                  onClick={() => void handleSelectSearchResult(row.path)}
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
