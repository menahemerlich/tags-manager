import type { Dispatch, SetStateAction } from 'react'
import type { TagFolderRow, TagRow } from '../../../../shared/types'
import { TagFolderCard } from '../../components/TagFolderCard'
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
  folderIdByTagId: Map<number, number>
  renameTagFolder: (folder: TagFolderRow) => void | Promise<void>
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
  folderIdByTagId,
  renameTagFolder,
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
        <div className="chips folder-cards" style={{ marginTop: 0 }}>
          {tagFolders.map((folder) => (
            <TagFolderCard
              key={folder.id}
              folder={folder}
              expanded={!!expandedTagFolderIds[folder.id]}
              accentStyle={getFolderAccentStyle(folder.id)}
              onToggle={() =>
                setExpandedTagFolderIds((prev) => ({
                  ...prev,
                  [folder.id]: !prev[folder.id]
                }))
              }
              menu={
                <div className="folder-chip-actions">
                  <button
                    type="button"
                    className="folder-chip-icon-btn"
                    aria-label={`עריכת שם התיקייה ${folder.name}`}
                    title="עריכת שם"
                    onClick={(e) => {
                      e.stopPropagation()
                      void renameTagFolder(folder)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={18}
                      height={18}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="folder-chip-icon-btn danger"
                    aria-label={`מחיקת התיקייה ${folder.name}`}
                    title="מחק תיקייה"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteTagFolder(folder)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={18}
                      height={18}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              }
            />
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
