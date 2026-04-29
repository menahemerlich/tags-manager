import { memo } from 'react'

interface Props {
  rootA: string
  rootB: string
  setRootA: (v: string) => void
  setRootB: (v: string) => void
  disabled?: boolean
  onSwap: () => void
}

async function pickFolder(setter: (v: string) => void): Promise<void> {
  const p = await window.api.pickFolder()
  if (p) setter(p)
}

/** Two side-by-side folder pickers labelled A and B with a swap button between them. */
function FolderSelectorImpl({ rootA, rootB, setRootA, setRootB, disabled, onSwap }: Props) {
  return (
    <div className="drive-sync-folder-row">
      <div className="drive-sync-folder">
        <label className="drive-sync-folder-label" htmlFor="drive-sync-root-a">
          תיקייה א'
        </label>
        <div className="drive-sync-folder-control">
          <input
            id="drive-sync-root-a"
            type="text"
            className="drive-sync-folder-input"
            value={rootA}
            onChange={(e) => setRootA(e.target.value)}
            disabled={disabled}
            placeholder="C:\Photos"
          />
          <button
            type="button"
            className="drive-sync-pick-btn"
            onClick={() => pickFolder(setRootA)}
            disabled={disabled}
          >
            בחר…
          </button>
        </div>
      </div>

      <button
        type="button"
        className="drive-sync-swap-btn"
        onClick={onSwap}
        disabled={disabled}
        title="החלף בין צדדים"
        aria-label="החלף בין תיקייה א' לתיקייה ב'"
      >
        ⇄
      </button>

      <div className="drive-sync-folder">
        <label className="drive-sync-folder-label" htmlFor="drive-sync-root-b">
          תיקייה ב'
        </label>
        <div className="drive-sync-folder-control">
          <input
            id="drive-sync-root-b"
            type="text"
            className="drive-sync-folder-input"
            value={rootB}
            onChange={(e) => setRootB(e.target.value)}
            disabled={disabled}
            placeholder="D:\Backup"
          />
          <button
            type="button"
            className="drive-sync-pick-btn"
            onClick={() => pickFolder(setRootB)}
            disabled={disabled}
          >
            בחר…
          </button>
        </div>
      </div>
    </div>
  )
}

export const FolderSelector = memo(FolderSelectorImpl)
