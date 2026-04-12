/** הנחיה עליונה והודעות שגיאה/הצלחה בעורך סימן מים. */
export function WatermarkEditorIntro({
  editorError,
  exportMsg,
  sessionSaveMsg
}: {
  editorError: string | null
  exportMsg: string | null
  sessionSaveMsg?: string | null
}) {
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>
        טען תמונה או סרטון ראשית, גרור את סימן המים למיקום הרצוי. בתמונות ניתן להשתמש בכלים לחיתוך או לטשטוש רקע לפני
        הייצוא; בווידאו ניתן להוסיף סימן מים וטקסט ולייצא קטע לפי טווח זמן (ללא חיתוך או טשטוש על הפריים). בפאנל הכלים
        אפשר ללחוץ «שמירת שינויים» כדי לשמור נקודת ייחוס של כל השכבות לפני מעבר בין כלים.
      </p>

      {editorError && (
        <p className="muted" style={{ color: 'var(--danger)', marginTop: '0.6rem' }}>
          {editorError}
        </p>
      )}
      {!editorError && sessionSaveMsg && (
        <p className="muted" style={{ color: '#86efac', marginTop: '0.6rem' }}>
          {sessionSaveMsg}
        </p>
      )}
      {!editorError && exportMsg && (
        <p className="muted" style={{ color: '#86efac', marginTop: sessionSaveMsg ? '0.35rem' : '0.6rem' }}>
          {exportMsg}
        </p>
      )}
    </>
  )
}
