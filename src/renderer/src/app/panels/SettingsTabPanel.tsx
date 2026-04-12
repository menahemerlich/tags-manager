import type { Dispatch, SetStateAction } from 'react'
import type { ImportConflictChoice, TagImportPreview, TransferPackageProgress } from '../../../../shared/types'
import UpdateSection from '../../pages/Settings/UpdateSection'

export type SettingsView = 'updates' | 'io' | 'transfer' | 'about'

export type SettingsTabPanelProps = {
  settingsView: SettingsView
  setSettingsView: (v: SettingsView) => void
  tagIoScopePath: string | null
  setTagIoScopePath: (v: string | null) => void
  setImportPreview: (v: TagImportPreview | null) => void
  setTagIoMsg: (v: string | null) => void
  importPreview: TagImportPreview | null
  importDefaultChoice: ImportConflictChoice
  setImportDefaultChoice: (v: ImportConflictChoice) => void
  importChoicesByPath: Record<string, ImportConflictChoice>
  setImportChoicesByPath: Dispatch<SetStateAction<Record<string, ImportConflictChoice>>>
  importApplying: boolean
  tagIoMsg: string | null
  chooseTagIoScope: () => void | Promise<void>
  handleExportTagsJson: () => void | Promise<void>
  handleImportPreview: () => void | Promise<void>
  handleApplyImport: () => void | Promise<void>
  transferMsg: string | null
  transferRevealPath: string | null
  isPackagingTransfer: boolean
  isImportingUserData: boolean
  transferBuildChoiceOpen: boolean
  setTransferBuildChoiceOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  setTransferMsg: (v: string | null) => void
  setTransferProgress: (v: TransferPackageProgress | null) => void
  transferProgress: TransferPackageProgress | null
  transferProgressPercent: number
  handlePackageForTransfer: (rebuildInstaller: boolean) => void | Promise<void>
  handleImportUserDataFromBackup: () => void | Promise<void>
}

/** טאב הגדרות: עדכונים, ייבוא/ייצוא תגיות, אריזת העברה, אודות */
export function SettingsTabPanel({
  settingsView,
  setSettingsView,
  tagIoScopePath,
  setTagIoScopePath,
  setImportPreview,
  setTagIoMsg,
  importPreview,
  importDefaultChoice,
  setImportDefaultChoice,
  importChoicesByPath,
  setImportChoicesByPath,
  importApplying,
  tagIoMsg,
  chooseTagIoScope,
  handleExportTagsJson,
  handleImportPreview,
  handleApplyImport,
  transferMsg,
  transferRevealPath,
  isPackagingTransfer,
  isImportingUserData,
  transferBuildChoiceOpen,
  setTransferBuildChoiceOpen,
  setTransferMsg,
  setTransferProgress,
  transferProgress,
  transferProgressPercent,
  handlePackageForTransfer,
  handleImportUserDataFromBackup
}: SettingsTabPanelProps) {
  return (
    <section className="panel">
      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={settingsView === 'updates' ? 'btn primary' : 'btn'}
          onClick={() => setSettingsView('updates')}
        >
          עדכונים
        </button>
        <button
          type="button"
          className={settingsView === 'io' ? 'btn primary' : 'btn'}
          onClick={() => setSettingsView('io')}
        >
          ייבוא/ייצוא
        </button>
        <button
          type="button"
          className={settingsView === 'transfer' ? 'btn primary' : 'btn'}
          onClick={() => setSettingsView('transfer')}
        >
          העברה
        </button>
        <button
          type="button"
          className={settingsView === 'about' ? 'btn primary' : 'btn'}
          onClick={() => setSettingsView('about')}
        >
          הסבר על האפליקציה
        </button>
      </div>

      {settingsView === 'updates' && <UpdateSection />}

      {settingsView === 'io' && (
        <>
          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <label>ייצוא/ייבוא תגיות לפי תחום (כונן/תיקייה)</label>
            <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
              <input
                readOnly
                style={{ flex: 1, minWidth: 220, background: 'rgba(26, 26, 46, 0.6)' }}
                value={tagIoScopePath ?? 'לא נבחר תחום'}
                title={tagIoScopePath ?? ''}
              />
              <button type="button" className="btn" onClick={() => void chooseTagIoScope()}>
                בחר תחום
              </button>
              {tagIoScopePath && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setTagIoScopePath(null)
                    setImportPreview(null)
                    setTagIoMsg(null)
                  }}
                >
                  נקה
                </button>
              )}
            </div>
            <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
              <button type="button" className="btn primary" onClick={() => void handleExportTagsJson()}>
                ייצוא תגיות לקובץ JSON
              </button>
              <button type="button" className="btn" onClick={() => void handleImportPreview()}>
                טעינת קובץ ייבוא וניתוח התנגשויות
              </button>
            </div>
            {importPreview && (
              <div className="field" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                <p className="muted small" style={{ margin: 0 }}>
                  קובץ: {importPreview.sourceFilePath}
                </p>
                <p className="muted small" style={{ margin: 0 }}>
                  סיכום: סה״כ {importPreview.totalEntries}, חדשים {importPreview.newEntries}, ללא שינוי{' '}
                  {importPreview.unchangedEntries}, התנגשויות {importPreview.conflictEntries}
                </p>
                <div className="field">
                  <label>ברירת מחדל להתנגשות</label>
                  <select
                    value={importDefaultChoice}
                    onChange={(e) => setImportDefaultChoice(e.target.value as ImportConflictChoice)}
                    style={{ maxWidth: 280 }}
                  >
                    <option value="skip">דלג</option>
                    <option value="replace">החלף בקובץ הייבוא</option>
                    <option value="merge">מזג תגיות</option>
                  </select>
                </div>
                {importPreview.conflicts.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '0.25rem' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>נתיב</th>
                          <th>קיים</th>
                          <th>מיובא</th>
                          <th>החלטה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.conflicts.map((c) => (
                          <tr key={c.path}>
                            <td className="path-cell">{c.path}</td>
                            <td className="path-cell">{c.existingDirectTags.join(', ') || '—'}</td>
                            <td className="path-cell">{c.importedDirectTags.join(', ') || '—'}</td>
                            <td>
                              <select
                                value={importChoicesByPath[c.path] ?? importDefaultChoice}
                                onChange={(e) =>
                                  setImportChoicesByPath((prev) => ({
                                    ...prev,
                                    [c.path]: e.target.value as ImportConflictChoice
                                  }))
                                }
                              >
                                <option value="skip">דלג</option>
                                <option value="replace">החלף</option>
                                <option value="merge">מזג</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="toolbar" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={importApplying}
                    onClick={() => void handleApplyImport()}
                  >
                    החל ייבוא
                  </button>
                </div>
              </div>
            )}
            {tagIoMsg && <p className="muted">{tagIoMsg}</p>}
          </div>
        </>
      )}

      {settingsView === 'transfer' && (
        <>
          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <label>אריזת התקנה להעברה למחשב אחר</label>
            <p className="muted small" style={{ marginTop: '0.35rem' }}>
              הפעולה תיצור תיקיית חבילה שכוללת מתקין עדכני של התוכנה, את נתוני המשתמש הקיימים אם נמצאו, וקובץ הוראות קצר
              להעברה.
            </p>
            <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
              <button type="button" className="btn" onClick={() => void window.api.openAppUserDataDir()}>
                פתח תיקיית נתוני האפליקציה
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleImportUserDataFromBackup()}
                disabled={isImportingUserData || isPackagingTransfer}
              >
                {isImportingUserData ? 'טוען נתונים...' : 'טען נתונים מקבצי גיבוי'}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={isPackagingTransfer}
                onClick={() => {
                  setTransferMsg(null)
                  setTransferProgress(null)
                  setTransferBuildChoiceOpen((prev) => !prev)
                }}
              >
                {isPackagingTransfer ? 'אורז...' : 'ארוז התקנה ונתונים להעברה'}
              </button>
              {transferRevealPath && (
                <button type="button" className="btn" onClick={() => void window.api.showInFolder(transferRevealPath)}>
                  פתח תיקיית תוצאה
                </button>
              )}
            </div>
            {transferBuildChoiceOpen && !isPackagingTransfer && (
              <div className="transfer-build-choice-card">
                <p className="transfer-build-choice-title">איך לארוז את המתקין?</p>
                <p className="muted small" style={{ marginTop: 0, marginBottom: '0.65rem' }}>
                  אפשר להשתמש במתקין קיים כדי לחסוך זמן, או לבנות מתקין חדש ועדכני לפני האריזה.
                </p>
                <div className="toolbar" style={{ marginBottom: 0 }}>
                  <button type="button" className="btn primary" onClick={() => void handlePackageForTransfer(true)}>
                    בנה מתקין חדש
                  </button>
                  <button type="button" className="btn" onClick={() => void handlePackageForTransfer(false)}>
                    השתמש במתקין קיים
                  </button>
                  <button type="button" className="btn" onClick={() => setTransferBuildChoiceOpen(false)}>
                    ביטול
                  </button>
                </div>
              </div>
            )}
            {transferMsg && (
              <p className="muted small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {transferMsg}
              </p>
            )}
            {transferProgress && (
              <div
                className={`transfer-progress-card ${transferProgress.stage === 'error' ? 'error' : transferProgress.stage === 'done' ? 'done' : ''}`}
              >
                <div className="transfer-progress-head">
                  <div>
                    <p className="transfer-progress-title">התקדמות האריזה</p>
                    <p className="transfer-progress-stage">{transferProgress.message}</p>
                  </div>
                  <div className="transfer-progress-percent">{transferProgressPercent}%</div>
                </div>
                <div className="transfer-progress-bar" aria-hidden="true">
                  <div className="transfer-progress-bar-fill" style={{ width: `${transferProgressPercent}%` }} />
                </div>
                {transferProgress.detail && <p className="transfer-progress-detail">{transferProgress.detail}</p>}
              </div>
            )}
          </div>
        </>
      )}

      {settingsView === 'about' && (
        <>
          <p className="muted small">
            <strong>ספרייה:</strong> בחרו קבצים/תיקיות, הוסיפו תגיות, ואז לחצו <strong>שמור וסיים</strong>. התגים נשמרים
            מקומית לצורך חיפוש.
          </p>
          <p className="muted small">
            <strong>חיפוש:</strong> בחרו תגיות — יוצגו רק <strong>קבצים</strong> שמכילים <strong>את כל</strong> התגיות. ניתן
            לצמצם לנתיב/כונן מסוים. לחיצה על שורה פותחת את הקובץ, ו־<strong>ערוך</strong> מאפשר לשנות תגיות.
          </p>
          <p className="muted small">
            <strong>תגיות:</strong> אפשר לשנות שם לתגית או למחוק אותה (זה ישפיע על כל המערכת).
          </p>
          <p className="muted small" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <strong>ייבוא/ייצוא:</strong> לשונית זו מאפשרת לייצא תגיות לקובץ JSON לפי תחום, ואז לייבא בחזרה. בעת ייבוא מוצג
            preview עם התנגשויות, כדי שתוכלו לבחור מה לעשות לפני שהשינויים מוחלים.
          </p>
        </>
      )}
    </section>
  )
}
