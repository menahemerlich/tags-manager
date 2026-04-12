import type { Dispatch, InputHTMLAttributes, SetStateAction } from 'react'
import type { WatermarkSelectionShape, WatermarkToolMode } from './watermarkTypes'
import { WatermarkBlurToolSettings } from './WatermarkBlurToolSettings'

export type WatermarkToolsPanelProps = {
  activeTool: WatermarkToolMode
  activateTool: (tool: WatermarkToolMode) => void
  setActiveTool: Dispatch<SetStateAction<WatermarkToolMode>>
  selectionShape: WatermarkSelectionShape
  setSelectionShape: Dispatch<SetStateAction<WatermarkSelectionShape>>
  baseIsVideo: boolean
  blurStrength: number
  setBlurStrength: Dispatch<SetStateAction<number>>
  blurFeather: number
  setBlurFeather: Dispatch<SetStateAction<number>>
  focusSeparation: number
  setFocusSeparation: Dispatch<SetStateAction<number>>
  blurSliderInteractionProps: InputHTMLAttributes<HTMLInputElement>
  onSaveSession: () => void
  saveSessionDisabled: boolean
  hasUnsavedChanges: boolean
  onDiscardSessionChanges: () => void
  discardSessionDisabled: boolean
}

/** פאנל כלים: רשת אייקונים, צורת בחירה, שמירה וביטול כלי. */
export function WatermarkToolsPanel({
  activeTool,
  activateTool,
  setActiveTool,
  selectionShape,
  setSelectionShape,
  baseIsVideo,
  blurStrength,
  setBlurStrength,
  blurFeather,
  setBlurFeather,
  focusSeparation,
  setFocusSeparation,
  blurSliderInteractionProps,
  onSaveSession,
  saveSessionDisabled,
  hasUnsavedChanges,
  onDiscardSessionChanges,
  discardSessionDisabled
}: WatermarkToolsPanelProps) {
  return (
    <div className="watermark-tools-panel">
      <div className="watermark-tool-palette">
        <p className="watermark-tool-palette-label">כלים</p>
        <div className="watermark-tool-palette-main">
          <button
            type="button"
            className={`watermark-tool-tile ${activeTool === 'crop' ? 'is-active' : ''}`}
            onClick={() => activateTool('crop')}
            disabled={baseIsVideo}
            title="חיתוך אזור"
            aria-label="חיתוך אזור"
            aria-pressed={activeTool === 'crop'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M4.5 10.25A.75.75 0 0 1 3.75 9.5V6A2.25 2.25 0 0 1 6 3.75h3.5a.75.75 0 0 1 0 1.5H6a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 1-.75.75Zm10 0a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75H18A2.25 2.25 0 0 1 20.25 6v3.5a.75.75 0 0 1-1.5 0V6a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 1 0-1.5H18A2.25 2.25 0 0 1 20.25 6v3.5a.75.75 0 0 1-.75.75ZM6 20.25A2.25 2.25 0 0 1 3.75 18v-3.5a.75.75 0 0 1 1.5 0V18c0 .41.34.75.75.75h3.5a.75.75 0 0 1 0 1.5H6Zm8.5 0a.75.75 0 0 1 0-1.5H18a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 1 1.5 0V18A2.25 2.25 0 0 1 18 20.25h-3.5Z"
                fill="currentColor"
              />
            </svg>
            <span className="watermark-tool-tile-label">חיתוך</span>
          </button>
          <button
            type="button"
            className={`watermark-tool-tile ${activeTool === 'blur' ? 'is-active' : ''}`}
            onClick={() => activateTool('blur')}
            disabled={baseIsVideo}
            title="טשטוש רקע"
            aria-label="טשטוש רקע"
            aria-pressed={activeTool === 'blur'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M12.46 2.6c.31.42 7.54 8.22 7.54 13.08A7.98 7.98 0 0 1 12 23.65 7.98 7.98 0 0 1 4 15.68C4 10.82 11.23 3.02 11.54 2.6a.58.58 0 0 1 .92 0Zm-.46 2.71c-2.2 2.54-6.83 8.37-6.83 10.37A6.83 6.83 0 0 0 12 22.52a6.83 6.83 0 0 0 6.83-6.84c0-2-4.63-7.83-6.83-10.37Zm3.21 7.66c1.55 0 2.8 1.33 2.8 2.98 0 1.37-.91 2.53-2.16 2.87-.23.06-.46-.16-.38-.39.11-.35.17-.72.17-1.11 0-1.9-1.37-3.48-3.16-3.78-.24-.04-.34-.33-.17-.5a3.38 3.38 0 0 1 2.9-1.07Z"
                fill="currentColor"
              />
            </svg>
            <span className="watermark-tool-tile-label">טשטוש</span>
          </button>
          <button
            type="button"
            className={`watermark-tool-tile ${activeTool === 'text' ? 'is-active' : ''}`}
            onClick={() => activateTool('text')}
            title="טקסט על התמונה"
            aria-label="טקסט על התמונה"
            aria-pressed={activeTool === 'text'}
          >
            <span className="watermark-tool-tile-letter" aria-hidden="true">
              T
            </span>
            <span className="watermark-tool-tile-label">טקסט</span>
          </button>
          <button
            type="button"
            className={`watermark-tool-tile ${activeTool === 'shapes' ? 'is-active' : ''}`}
            onClick={() => activateTool('shapes')}
            title="צורות"
            aria-label="צורות"
            aria-pressed={activeTool === 'shapes'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 5h8v8H5V5Zm10 0h4v4h-4V5ZM5 15h4v4H5v-4Zm10 0h4v4h-4v-4Zm-8 2h8v2H7v-2Z"
              />
            </svg>
            <span className="watermark-tool-tile-label">צורות</span>
          </button>
        </div>

        {(activeTool === 'crop' || activeTool === 'blur') && !baseIsVideo && (
          <>
            <div className="watermark-tool-palette-divider" role="presentation" />

            <p className="watermark-tool-palette-label">צורת אזור (חיתוך / טשטוש)</p>
            <div className="watermark-tool-palette-shapes">
              <button
                type="button"
                className={`watermark-tool-tile watermark-tool-tile--shape ${selectionShape === 'rect' ? 'is-active' : ''}`}
                onClick={() => setSelectionShape('rect')}
                disabled={baseIsVideo}
                title="מלבן"
                aria-label="בחירה מרובעת"
                aria-pressed={selectionShape === 'rect'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M7 4.75h10A2.25 2.25 0 0 1 19.25 7v10A2.25 2.25 0 0 1 17 19.25H7A2.25 2.25 0 0 1 4.75 17V7A2.25 2.25 0 0 1 7 4.75Zm0 1.5A.75.75 0 0 0 6.25 7v10c0 .41.34.75.75.75h10c.41 0 .75-.34.75-.75V7a.75.75 0 0 0-.75-.75H7Z"
                    fill="currentColor"
                  />
                </svg>
                <span className="watermark-tool-tile-label">מרובע</span>
              </button>
              <button
                type="button"
                className={`watermark-tool-tile watermark-tool-tile--shape ${selectionShape === 'circle' ? 'is-active' : ''}`}
                onClick={() => setSelectionShape('circle')}
                disabled={baseIsVideo}
                title="עיגול"
                aria-label="בחירה עגולה"
                aria-pressed={selectionShape === 'circle'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M12 4.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5Zm0 1.5a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5Z"
                    fill="currentColor"
                  />
                </svg>
                <span className="watermark-tool-tile-label">עיגול</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="watermark-tool-session-actions">
        <button
          type="button"
          className="btn watermark-tool-save-btn"
          onClick={onSaveSession}
          disabled={saveSessionDisabled}
          title="שומר את כל השכבות וההגדרות הנוכחיות (חיתוך, טשטוש, טקסט, צורות, סימן מים) כנקודת ייחוס לפני מעבר בין כלים"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="watermark-tool-save-icon">
            <path
              fill="currentColor"
              d="M17 3H5c-1.1 0-2 .9-2 2v14h4v-2H5V5h12v14h-2v2h4V5c0-1.1-.89-2-2-2zm-5 16c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
            />
          </svg>
          שמירת שינויים
          {hasUnsavedChanges && <span className="watermark-tool-save-dot" aria-hidden="true" title="יש שינויים שלא נשמרו" />}
        </button>
        <button
          type="button"
          className="btn watermark-tool-discard-btn"
          onClick={() => void onDiscardSessionChanges()}
          disabled={discardSessionDisabled}
          title="אם יש שינויים שלא נשמרו — חזרה לשמירה האחרונה. אם הכול נשמר — חזרה לטעינה הראשונית של הקובץ (לפני השמירות). אם מעולם לא נשמר — טעינה מחדש מהדיסק."
        >
          ביטול כל השינויים
        </button>
        <button
          type="button"
          className="btn watermark-tool-cancel-btn watermark-tool-session-span"
          onClick={() => setActiveTool('none')}
        >
          ביטול בחירת כלי
        </button>
      </div>

      {activeTool === 'blur' && (
        <WatermarkBlurToolSettings
          blurStrength={blurStrength}
          setBlurStrength={setBlurStrength}
          blurFeather={blurFeather}
          setBlurFeather={setBlurFeather}
          focusSeparation={focusSeparation}
          setFocusSeparation={setFocusSeparation}
          blurSliderInteractionProps={blurSliderInteractionProps}
        />
      )}
    </div>
  )
}
