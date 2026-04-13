import type { WatermarkEditorSnapshot } from '../../watermarkEditorSession'

/** פרטי מדיה שנשמרים נקודתית כדי לאפשר שחזור לאחר ביטול. */
export type WatermarkSavedMediaState = {
  /** נתיב קובץ המדיה הבסיסית. */
  baseImagePath: string
  /** מקור תצוגה לבסיס (data URL או null בוידאו). */
  baseImageSrc: string | null
  /** מידות המדיה בפיקסלים. */
  baseImageSize: { width: number; height: number } | null
  /** האם הבסיס מגיע מאפייה (data URL) ולא מהדיסק. */
  baseImagePixelsFromBake: boolean
  /** URL לניגון וידאו (אם רלוונטי). */
  baseVideoUrl: string | null
  /** משך הווידאו בשניות. */
  videoDurationSec: number
}

/** baseline ראשוני של סשן: snapshot + מדיה. */
export type WatermarkInitialSessionBaseline = {
  /** snapshot מצב העורך בנקודת baseline. */
  snapshot: WatermarkEditorSnapshot
  /** מידע מדיה מינימלי לשחזור. */
  media: WatermarkSavedMediaState
}
