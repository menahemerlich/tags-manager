/** מגביל מספר לטווח סגור [min, max]. */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** טוען מידות טבעיות של תמונה מ־URL (data או http). */
export function loadImageDimensions(imageSrc: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('טעינת תמונה נכשלה'))
    img.src = imageSrc
  })
}

/** בודק אם נתיב קובץ מייצג וידאו לפי סיומת. */
export function isWatermarkVideoPath(filePath: string): boolean {
  const p = filePath.toLowerCase()
  return ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].some((ext) => p.endsWith(ext))
}

/** ממיר שניות לטקסט קצר לתצוגה בציר זמן הווידאו (למשל 1:0.3). */
export function formatWatermarkTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const sRem = sec % 60
  const wholeS = Math.floor(sRem)
  const frac = Math.round((sRem - wholeS) * 10)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const core = h > 0 ? `${h}:${pad2(m)}:${pad2(wholeS)}` : `${m}:${pad2(wholeS)}`
  if (frac <= 0) return core
  return `${core}.${frac}`
}
