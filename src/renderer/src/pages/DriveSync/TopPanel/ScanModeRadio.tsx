import { memo } from 'react'
import type { ScanMode } from '../../../../../shared/driveSyncTypes'

interface Props {
  mode: ScanMode
  setMode: (m: ScanMode) => void
  disabled?: boolean
}

function ScanModeRadioImpl({ mode, setMode, disabled }: Props) {
  return (
    <div className="drive-sync-mode" role="radiogroup" aria-label="מצב השוואה">
      <span className="drive-sync-mode-legend">מצב השוואה</span>
      <label>
        <input
          type="radio"
          name="scan-mode"
          value="fast"
          checked={mode === 'fast'}
          onChange={() => setMode('fast')}
          disabled={disabled}
        />
        מהירה (לפי שם וגודל)
      </label>
      <label>
        <input
          type="radio"
          name="scan-mode"
          value="accurate"
          checked={mode === 'accurate'}
          onChange={() => setMode('accurate')}
          disabled={disabled}
        />
        מדויקת (כולל hash)
      </label>
    </div>
  )
}

export const ScanModeRadio = memo(ScanModeRadioImpl)
