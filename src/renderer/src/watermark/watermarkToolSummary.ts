import type { WatermarkSelectionShape, WatermarkToolMode } from './watermarkTypes'

/** שורת סיכום כלי פעיל לעמודת הסטטוס. */
export function getWatermarkToolSummary(
  baseIsVideo: boolean,
  activeTool: WatermarkToolMode,
  selectionShape: WatermarkSelectionShape
): string {
  if (baseIsVideo) {
    if (activeTool === 'text') {
      return 'טקסט: גרירה מתוך התיבה; לחיצה על הרקע או Esc סוגרות מסגרת; מחיקה ועיצוב בפס למטה.'
    }
    if (activeTool === 'shapes') {
      return 'צורות: פס עריכה מתחת לתמונה; גרירה, שינוי גודל וסיבוב; לחיצה על הרקע מסתירה ידיות.'
    }
    return 'וידאו: סימן מים, טקסט, צורות וייצוא קטע (ללא חיתוך או טשטוש על הפריים).'
  }
  if (activeTool === 'crop') {
    return `חיתוך פעיל: ${selectionShape === 'circle' ? 'עגול' : 'מרובע'}.`
  }
  if (activeTool === 'blur') {
    return `טשטוש רקע פעיל: ${selectionShape === 'circle' ? 'בחירה עגולה' : 'בחירה מרובעת'}.`
  }
  if (activeTool === 'text') {
    return 'טקסט: גרירה מתוך התיבה; לחיצה על הרקע או Esc סוגרות מסגרת; מחיקה ועיצוב בפס למטה.'
  }
  if (activeTool === 'shapes') {
    return 'צורות: פס עריכה מתחת לתמונה; גרירה וסיבוב; לחיצה על הרקע מסתירה ידיות.'
  }
  return 'אין כרגע כלי עריכה פעיל.'
}
