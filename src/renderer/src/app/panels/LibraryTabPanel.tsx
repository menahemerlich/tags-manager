import type { Dispatch, SetStateAction } from 'react'
import type { PathKind, TagFolderRow, TagRow } from '../../../../shared/types'
import { FilePreview } from '../../components/FilePreview'
import { TagFolderCard } from '../../components/TagFolderCard'
import { kindHe, getFolderAccentStyle, type FolderAccentStyle } from '../folderAccent'

export type LibraryTabPanelProps = {
  librarySelectedItems: { path: string; kind: PathKind }[] | null
  libraryTags: string[]
  libraryTagDraft: string
  setLibraryTagDraft: (v: string) => void
  libraryFolderSuggestions: string[]
  smartSuggestBusy: boolean
  tags: TagRow[]
  tagFolders: TagFolderRow[]
  expandedLibraryFolderIds: Record<number, boolean>
  setExpandedLibraryFolderIds: Dispatch<SetStateAction<Record<number, boolean>>>
  folderIdByTagId: Map<number, number>
  onPickFiles: () => void
  onPickFolders: () => void
  onSmartSuggest: () => void | Promise<void>
  onOpenInWatermark: (path: string) => void
  onOpenInFaces: (path: string) => void
  requestAddLibraryTag: (raw: string) => void | Promise<void>
  removeLibraryTag: (name: string) => void
  getTagClassName: (tagName: string, baseClass: 'tag' | 'chip', isActive?: boolean) => string
  getTagAccentStyle: (tagName: string) => FolderAccentStyle | undefined
  formatTagLabel: (name: string) => string
  onSaveAndDone: () => void | Promise<void>
  onCancel: () => void
}

/** טאב ספרייה: בחירת קבצים/תיקיות והוספת תגיות לפני שמירה */
export function LibraryTabPanel({
  librarySelectedItems,
  libraryTags,
  libraryTagDraft,
  setLibraryTagDraft,
  libraryFolderSuggestions,
  smartSuggestBusy,
  tags,
  tagFolders,
  expandedLibraryFolderIds,
  setExpandedLibraryFolderIds,
  folderIdByTagId,
  onPickFiles,
  onPickFolders,
  onSmartSuggest,
  onOpenInWatermark,
  onOpenInFaces,
  requestAddLibraryTag,
  removeLibraryTag,
  getTagClassName,
  getTagAccentStyle,
  formatTagLabel,
  onSaveAndDone,
  onCancel
}: LibraryTabPanelProps) {
  return (
    <section className="panel">
      {!librarySelectedItems ? (
        <div>
          <p className="muted small" style={{ marginTop: 0, marginBottom: '1rem' }}>
            בחרו קובץ או תיקייה, הוסיפו תגיות ושמרו. המידע נשמר במחשב לצורך חיפוש.
          </p>
          <div className="toolbar">
            <button type="button" className="btn primary" onClick={onPickFiles}>
              בחר קבצים
            </button>
            <button type="button" className="btn primary" onClick={onPickFolders}>
              בחר תיקיות
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="library-selection-topbar">
            <p className="muted small" style={{ marginTop: 0, marginBottom: 0 }}>
              פריטים נבחרים:
            </p>
            <button
              type="button"
              className="btn smart-suggest-btn"
              onClick={() => void onSmartSuggest()}
              disabled={smartSuggestBusy}
              title="מציע תגיות אוטומטית לפי דגימה (לוקאלי, לא שולח לענן)"
            >
              <span className="smart-suggest-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3.2c2.2 2.7 3.6 4.5 6.6 5.7-3 1.2-4.4 3-6.6 5.7-2.2-2.7-3.6-4.5-6.6-5.7 3-1.2 4.4-3 6.6-5.7Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.2 13.1c1 1.2 1.7 2 3.1 2.5-1.4.6-2.1 1.3-3.1 2.6-1-1.2-1.7-2-3.1-2.6 1.4-.5 2.1-1.3 3.1-2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                </svg>
              </span>
              <span className="smart-suggest-label">{smartSuggestBusy ? 'מחשב…' : 'הצע תגיות'}</span>
            </button>
          </div>
          <ul className="path-list" style={{ marginBottom: '1rem' }}>
            {librarySelectedItems.map((item) => (
              <li key={item.path}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <FilePreview
                    key={item.path}
                    filePath={item.path}
                    pathKind={item.kind}
                    onOpenInWatermark={onOpenInWatermark}
                    onOpenInFaces={onOpenInFaces}
                  />
                  <span>
                    <span className="path-cell">{item.path}</span>{' '}
                    <span className="muted">({kindHe(item.kind)})</span>
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
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void requestAddLibraryTag(libraryTagDraft))}
              />
              <button type="button" className="btn primary" onClick={() => void requestAddLibraryTag(libraryTagDraft)}>
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
                  <div className="chips folder-cards" style={{ marginBottom: '0.35rem' }}>
                    {tagFolders.map((folder) => (
                      <TagFolderCard
                        key={`library-folder-${folder.id}`}
                        folder={folder}
                        expanded={!!expandedLibraryFolderIds[folder.id]}
                        accentStyle={getFolderAccentStyle(folder.id)}
                        onToggle={() =>
                          setExpandedLibraryFolderIds((prev) => ({
                            ...prev,
                            [folder.id]: !prev[folder.id]
                          }))
                        }
                      />
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
            <button type="button" className="btn primary" onClick={() => void onSaveAndDone()}>
              שמור וסיים
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
