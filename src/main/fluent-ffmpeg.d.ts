/** הצהרות טיפוס מינימליות ל־`fluent-ffmpeg` (אין `@types` רשמי מותקן בפרויקט). */
declare module 'fluent-ffmpeg' {
  /** מטא־דאטה בסיסית שמוחזרת מ־ffprobe. */
  export type FfprobeData = {
    format?: {
      duration?: string | number
    }
  }

  /** מופע פקודת ffmpeg לקובץ מדיה. */
  export type FfmpegCommand = {
    input: (path: string) => FfmpegCommand
    inputOptions: (opts: string[]) => FfmpegCommand
    seekInput: (time: number) => FfmpegCommand
    setStartTime: (time: number) => FfmpegCommand
    duration: (seconds: number) => FfmpegCommand
    frames: (n: number) => FfmpegCommand
    complexFilter: (filter: string) => FfmpegCommand
    outputOptions: (opts: string[]) => FfmpegCommand
    output: (path: string) => FfmpegCommand
    save: (path: string) => FfmpegCommand
    on: (event: 'end' | 'error' | 'progress' | (string & {}), cb: (...args: any[]) => void) => FfmpegCommand
    run: () => void
  }

  /** פונקציית יצירת פקודת ffmpeg. */
  type FfmpegFactory = ((input: string) => FfmpegCommand) & {
    setFfmpegPath: (p: string) => void
    setFfprobePath: (p: string) => void
    ffprobe: (file: string, cb: (err: Error | null, data: FfprobeData) => void) => void
  }

  /** ייצוא ברירת מחדל של המודול. */
  const ffmpeg: FfmpegFactory
  export default ffmpeg
}
