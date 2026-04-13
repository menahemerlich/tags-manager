import { useRef } from 'react'
import type { WatermarkSelectionHandle, WatermarkSelectionRect } from '../../watermarkTypes'

/** מצב גרירה של שכבת טקסט (move/resize/rotate) במונחי מדיה ו־client coords. */
export type WatermarkTextDragState =
  | {
      /** מזהה שכבת הטקסט הנגררת. */
      textId: string
      /** מצב גרירה: ידית בחירה או סיבוב. */
      mode: WatermarkSelectionHandle | 'rotate'
      /** נקודת התחלה ב־client coords. */
      startClientX: number
      /** נקודת התחלה ב־client coords. */
      startClientY: number
      /** מלבן התחלה ביחידות מדיה. */
      startRect: WatermarkSelectionRect
      /** גודל פונט בתחילת גרירה (למקרה resize). */
      fontSizePx: number
      /** סיבוב התחלה (אופציונלי). */
      startRotation?: number
      /** pivot X ב־client coords (לסיבוב). */
      pivotClientX?: number
      /** pivot Y ב־client coords (לסיבוב). */
      pivotClientY?: number
      /** זווית pointer התחלתית (לסיבוב). */
      startPointerAngle?: number
    }
  | null

/** מצב גרירה של סימן המים (מלבן סימן מים). */
export type WatermarkRectDragState =
  | {
      /** סוג גרירה: הזזה או שינוי גודל. */
      mode: 'move' | 'resize'
      /** נקודת התחלה ב־client coords. */
      startClientX: number
      /** נקודת התחלה ב־client coords. */
      startClientY: number
      /** מלבן התחלה ביחידות מדיה. */
      startRect: WatermarkSelectionRect
    }
  | null

/** מצב גרירה של מלבן בחירה (crop/blur). */
export type WatermarkSelectionDragState =
  | {
      /** ידית בחירה שממנה נגרר (כולל move). */
      mode: WatermarkSelectionHandle
      /** נקודת התחלה ב־client coords. */
      startClientX: number
      /** נקודת התחלה ב־client coords. */
      startClientY: number
      /** מלבן התחלה ביחידות מדיה. */
      startRect: WatermarkSelectionRect
    }
  | null

/** אוסף refs מרכזיים של עורך סימן מים, כדי להשאיר את הטאב רזה. */
export type WatermarkEditorRefs = {
  /** ref לתמונה הבסיסית ב־DOM. */
  baseImgRef: React.MutableRefObject<HTMLImageElement | null>
  /** ref לוידאו הבסיסי ב־DOM. */
  baseVideoRef: React.MutableRefObject<HTMLVideoElement | null>
  /** ref לעוטף המדיה בבמה (DOM). */
  stageMediaWrapRef: React.MutableRefObject<HTMLDivElement | null>
  /** ref ל־textarea של שכבת טקסט פתוחה. */
  textInputRef: React.MutableRefObject<HTMLTextAreaElement | null>
  /** ref למצב גרירת סימן המים (מלבן). */
  dragStateRef: React.MutableRefObject<WatermarkRectDragState>
  /** ref למצב גרירת בחירה (crop/blur). */
  selectionDragStateRef: React.MutableRefObject<WatermarkSelectionDragState>
  /** ref למצב גרירת טקסט. */
  textDragStateRef: React.MutableRefObject<WatermarkTextDragState>
  /** ref שמונע ייצוא כפול במקביל. */
  watermarkExportInFlightRef: React.MutableRefObject<boolean>
}

/** יוצר את כל refs של העורך במקום אחד (כדי למנוע פיזור של useRef). */
export function useWatermarkEditorRefs(): WatermarkEditorRefs {
  /** ref למצב גרירת טקסט (move/resize/rotate). */
  const textDragStateRef = useRef<WatermarkTextDragState>(null)
  /** ref שמונע הפעלה כפולה של ייצוא. */
  const watermarkExportInFlightRef = useRef(false)
  /** ref לתמונה הבסיסית ב־DOM. */
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  /** ref לוידאו הבסיסי ב־DOM. */
  const baseVideoRef = useRef<HTMLVideoElement | null>(null)
  /** ref לעוטף המדיה בבמה (DOM). */
  const stageMediaWrapRef = useRef<HTMLDivElement | null>(null)
  /** ref לשדה הטקסט (textarea) בעת עריכה. */
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)
  /** ref למצב גרירת סימן המים (move/resize). */
  const dragStateRef = useRef<WatermarkRectDragState>(null)
  /** ref למצב גרירת מלבן בחירה (crop/blur). */
  const selectionDragStateRef = useRef<WatermarkSelectionDragState>(null)

  return {
    baseImgRef,
    baseVideoRef,
    stageMediaWrapRef,
    textInputRef,
    dragStateRef,
    selectionDragStateRef,
    textDragStateRef,
    watermarkExportInFlightRef
  }
}

