import { useEffect, useState } from 'react'
import type { TagFolderRow, TagRow } from '../../../shared/types'

type Props = {
  tag: TagRow
  folderId: number | null
  folders: TagFolderRow[]
  onAssignFolder: (folderId: string) => void
  onChanged: () => void
}

/**
 * שורה בטבלת ניהול תגיות: שיוך לתיקייה, שינוי שם ומחיקה.
 */
export function TagRenameRow({ tag, folderId, folders, onAssignFolder, onChanged }: Props) {
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
