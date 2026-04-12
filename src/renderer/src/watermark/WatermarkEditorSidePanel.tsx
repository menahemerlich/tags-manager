import type { Dispatch, InputHTMLAttributes, SetStateAction } from 'react'
import type { WatermarkSelectionShape, WatermarkToolMode } from './watermarkTypes'
import { WatermarkToolsPanel } from './WatermarkToolsPanel'

export type WatermarkEditorSidePanelProps = {
  pickBaseMedia: () => Promise<void>
  pickWatermarkImage: () => Promise<void>
  resetWatermarkToDefault: () => void
  isCustomWatermark: boolean
  watermarkImageSrc: string | null
  isToolsOpen: boolean
  setIsToolsOpen: Dispatch<SetStateAction<boolean>>
  baseImageSrc: string | null
  baseVideoUrl: string | null
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
  exportMain: () => Promise<void>
  exportDisabled: boolean
  isExporting: boolean
  resetEditor: () => void
  watermarkOpacity: number
  setWatermarkOpacity: Dispatch<SetStateAction<number>>
  defaultWatermarkAssetUrl: string
  baseImagePath: string | null
  watermarkImagePath: string | null
  videoDurationSec: number
  toolSummary: string
  isSelectionToolActive: boolean
  onSaveSession: () => void
  saveSessionDisabled: boolean
  hasUnsavedSessionChanges: boolean
  onDiscardSessionChanges: () => void
  discardSessionDisabled: boolean
}

/** עמודת שמאל: טעינת קבצים, כלים, ייצוא, שקיפות והנחיות. */
export function WatermarkEditorSidePanel({
  pickBaseMedia,
  pickWatermarkImage,
  resetWatermarkToDefault,
  isCustomWatermark,
  watermarkImageSrc,
  isToolsOpen,
  setIsToolsOpen,
  baseImageSrc,
  baseVideoUrl,
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
  exportMain,
  exportDisabled,
  isExporting,
  resetEditor,
  watermarkOpacity,
  setWatermarkOpacity,
  defaultWatermarkAssetUrl,
  baseImagePath,
  watermarkImagePath,
  videoDurationSec,
  toolSummary,
  isSelectionToolActive,
  onSaveSession,
  saveSessionDisabled,
  hasUnsavedSessionChanges,
  onDiscardSessionChanges,
  discardSessionDisabled
}: WatermarkEditorSidePanelProps) {
  return (
    <div className="watermark-side-panel">
      <div className="toolbar watermark-side-actions">
        <button type="button" className="btn primary" onClick={() => void pickBaseMedia()}>
          בחר תמונה או סרטון ראשי
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => (isCustomWatermark ? resetWatermarkToDefault() : void pickWatermarkImage())}
          disabled={!watermarkImageSrc && isCustomWatermark}
        >
          {isCustomWatermark ? 'חזור ללוגו' : 'העלה סימן מים אחר'}
        </button>
        <div className="watermark-action-row">
          <button
            type="button"
            className={`btn ${isToolsOpen ? 'primary' : ''}`}
            onClick={() => setIsToolsOpen((prev) => !prev)}
            disabled={!baseImageSrc && !baseVideoUrl}
          >
            כלים
          </button>
          <button
            type="button"
            className="btn primary watermark-export-btn"
            onClick={() => void exportMain()}
            disabled={exportDisabled}
            title={isExporting ? 'מייצא...' : baseIsVideo ? 'ייצא קטע MP4 עם סימן מים' : 'ייצא תמונה'}
            aria-label={isExporting ? 'מייצא' : baseIsVideo ? 'ייצא סרט' : 'ייצא תמונה'}
          >
            {isExporting ? (
              <span className="watermark-export-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
        {isToolsOpen && (baseImageSrc || baseVideoUrl) && (
          <WatermarkToolsPanel
            activeTool={activeTool}
            activateTool={activateTool}
            setActiveTool={setActiveTool}
            selectionShape={selectionShape}
            setSelectionShape={setSelectionShape}
            baseIsVideo={baseIsVideo}
            blurStrength={blurStrength}
            setBlurStrength={setBlurStrength}
            blurFeather={blurFeather}
            setBlurFeather={setBlurFeather}
            focusSeparation={focusSeparation}
            setFocusSeparation={setFocusSeparation}
            blurSliderInteractionProps={blurSliderInteractionProps}
            onSaveSession={onSaveSession}
            saveSessionDisabled={saveSessionDisabled}
            hasUnsavedChanges={hasUnsavedSessionChanges}
            onDiscardSessionChanges={onDiscardSessionChanges}
            discardSessionDisabled={discardSessionDisabled}
          />
        )}
        <button type="button" className="btn" onClick={resetEditor}>
          ביטול
        </button>
      </div>

      <div className="field">
        <label>שקיפות סימן המים: {Math.round(watermarkOpacity * 100)}%</label>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(watermarkOpacity * 100)}
          onChange={(e) => setWatermarkOpacity(Number(e.target.value) / 100)}
          disabled={!watermarkImageSrc}
        />
      </div>

      {baseIsVideo && videoDurationSec > 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          טווח הקטע לייצוא מוגדר מתחת לתצוגת הווידאו (גרירת סימונים על ציר הזמן).
        </p>
      )}

      <div className="watermark-status-list">
        <p className="muted small">
          {baseImagePath
            ? baseIsVideo
              ? `סרט ראשי: ${baseImagePath}`
              : `תמונה ראשית: ${baseImagePath}`
            : 'עדיין לא נבחרה מדיה ראשית.'}
        </p>
        <p className="muted small">
          {watermarkImagePath === defaultWatermarkAssetUrl
            ? 'סימן המים הנוכחי: לוגו המערכת (ברירת מחדל).'
            : `סימן המים הנוכחי: ${watermarkImagePath ?? 'לא נבחר סימן מים'}`}
        </p>
        <p className="muted small" style={{ marginTop: 0 }}>
          גרור את סימן המים עם העכבר. לשינוי גודל השתמש בידית שבפינה הימנית-תחתונה.
        </p>
        <p className="muted small">{toolSummary}</p>
        {isSelectionToolActive && (
          <p className="muted small">
            גרור את מסגרת הבחירה לשינוי מיקום. בצורה עגולה ניתן לשנות גודל רק מארבעה צדדים.
          </p>
        )}
        {activeTool === 'text' && (
          <p className="muted small">
            לחיצה על הטקסט פותחת עריכה; גרירה מתוך התיבה (כמו צורות); לחיצה על הרקע או Esc סוגרות את המסגרת; מחיקה בפס
            למטה; עיצוב בפס מתחת.
          </p>
        )}
        {activeTool === 'shapes' && (
          <p className="muted small">
            בחר צורה מהפס מתחת לתצוגה; לחיצה על רקע התמונה מסתירה ידיות עד שתבחר שוב צורה.
          </p>
        )}
      </div>
    </div>
  )
}
