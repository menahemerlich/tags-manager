/** מייצא פונקציות מיקום/גבולות לשכבות סימן מים. */
export { clampRectIntoBounds as clampWatermarkIntoBounds } from './bounds/clampRectIntoBounds'

/** מייצא חישוב גבולות להצבת שכבות (כל התמונה או crop). */
export { getPlacementBounds } from './bounds/getPlacementBounds'

/** מייצא ברירת מחדל למסגרת בחירה. */
export { createDefaultSelectionRect } from './defaults/createDefaultSelectionRect'

/** מייצא ברירת מחדל למיקום סימן מים. */
export { placeDefaultWatermark } from './defaults/placeDefaultWatermark'

/** מייצא ברירת מחדל למיקום תיבת טקסט. */
export { placeDefaultTextRect } from './defaults/placeDefaultTextRect'

/** מייצא מיפוי שכבות לאחר חיתוך תמונה. */
export { mapLayersAfterImageCrop } from './mapping/mapLayersAfterImageCrop'

