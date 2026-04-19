import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { TagFolderRow } from '../../../shared/types'
import type { FolderAccentStyle } from './folderAccent'

type TagFolderPickerState = { open: boolean; tagName: string; selectedFolderId: string }

type SearchTagsModalState = { open: boolean; path: string; tags: string[] }

export type RenameTagFolderModalState = { open: boolean; folderId: number; nameDraft: string }

type IndexingState = { done: number; total: number; currentPath: string }

type ImportProgressState = { done: number; total: number }

type Props = {
  indexing: IndexingState | null
  onCancelIndex: () => void | Promise<void>
  importApplying: boolean
  importProgress: ImportProgressState | null
  tagFolderPicker: TagFolderPickerState
  tagFolders: TagFolderRow[]
  setTagFolderPicker: (v: TagFolderPickerState | ((prev: TagFolderPickerState) => TagFolderPickerState)) => void
  closeTagFolderPicker: (nextValue: number | null | undefined) => void
  searchTagsModal: SearchTagsModalState
  setSearchTagsModal: (v: SearchTagsModalState) => void
  getTagClassName: (tagName: string, baseClass: 'tag' | 'chip', isActive?: boolean) => string
  getTagAccentStyle: (tagName: string) => FolderAccentStyle | undefined
  formatTagLabel: (name: string) => string
  renameTagFolderModal: RenameTagFolderModalState
  setRenameTagFolderModal: Dispatch<SetStateAction<RenameTagFolderModalState>>
  applyRenameTagFolder: () => void | Promise<void>
}

/** אוברליים גלובליים: אינדוקס, ייבוא, בחירת תיקייה לתגית, תצוגת כל התגיות מתוצאת חיפוש */
export function AppOverlays({
  indexing,
  onCancelIndex,
  importApplying,
  importProgress,
  tagFolderPicker,
  tagFolders,
  setTagFolderPicker,
  closeTagFolderPicker,
  searchTagsModal,
  setSearchTagsModal,
  getTagClassName,
  getTagAccentStyle,
  formatTagLabel,
  renameTagFolderModal,
  setRenameTagFolderModal,
  applyRenameTagFolder
}: Props) {
  const renameTagFolderInputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (!renameTagFolderModal.open) return
    /** rAF כפול — אחרי שהכרטיס נצבע; בלי select() כדי לא להפריע ל-IME בעברית */
    let id2: number | undefined
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        renameTagFolderInputRef.current?.focus()
      })
    })
    return () => {
      cancelAnimationFrame(id1)
      if (id2 !== undefined) cancelAnimationFrame(id2)
    }
  }, [renameTagFolderModal.open, renameTagFolderModal.folderId])

  return (
    <>
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
              <button type="button" className="btn danger" onClick={() => void onCancelIndex()}>
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
                onClick={() =>
                  closeTagFolderPicker(tagFolderPicker.selectedFolderId ? Number(tagFolderPicker.selectedFolderId) : null)
                }
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
      {renameTagFolderModal.open && (
        <div
          className="overlay"
          onClick={(e) =>
            e.target === e.currentTarget &&
            setRenameTagFolderModal({ open: false, folderId: 0, nameDraft: '' })
          }
        >
          <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <strong>שינוי שם תיקייה</strong>
            <p className="muted small" style={{ marginBottom: '0.5rem' }}>
              הזינו שם חדש לתיקייה.
            </p>
            <div className="field">
              <label htmlFor="rename-tag-folder-input">שם תיקייה</label>
              <input
                ref={renameTagFolderInputRef}
                id="rename-tag-folder-input"
                type="text"
                value={renameTagFolderModal.nameDraft}
                onChange={(e) =>
                  setRenameTagFolderModal((prev) => ({ ...prev, nameDraft: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void applyRenameTagFolder()
                  }
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="toolbar" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <button type="button" className="btn primary" onClick={() => void applyRenameTagFolder()}>
                שמור
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setRenameTagFolderModal({ open: false, folderId: 0, nameDraft: '' })}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      {searchTagsModal.open && (
        <div
          className="overlay"
          onClick={(e) => e.target === e.currentTarget && setSearchTagsModal({ open: false, path: '', tags: [] })}
        >
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
    </>
  )
}
