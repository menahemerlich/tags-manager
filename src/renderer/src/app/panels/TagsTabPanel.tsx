import type { Dispatch, SetStateAction } from 'react'
import type { TagFolderRow, TagRow } from '../../../../shared/types'
import { TagRenameRow } from '../../components/TagRenameRow'
import { getFolderAccentStyle } from '../folderAccent'

export type TagsTabPanelProps = {
  newTagFolderName: string
  setNewTagFolderName: (v: string) => void
  createTagFolder: () => void | Promise<void>
  tagFolders: TagFolderRow[]
  tags: TagRow[]
  expandedTagFolderIds: Record<number, boolean>
  setExpandedTagFolderIds: Dispatch<SetStateAction<Record<number, boolean>>>
  openTagFolderMenuId: number | null
  setOpenTagFolderMenuId: Dispatch<SetStateAction<number | null>>
  folderIdByTagId: Map<number, number>
  deleteTagFolder: (folder: TagFolderRow) => void | Promise<void>
  assignTagToFolder: (tagId: number, folderIdRaw: string) => void | Promise<void>
  onTagsChanged: () => void | Promise<void>
}

/** טאב ניהול תגיות: תיקיות, טבלאות שינוי שם ושיוך */
export function TagsTabPanel({
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
  onTagsChanged
}: TagsTabPanelProps) {
  return (
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
                    onChanged={onTagsChanged}
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
                  onChanged={onTagsChanged}
                />
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
