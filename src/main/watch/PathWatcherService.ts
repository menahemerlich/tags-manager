import { existsSync } from 'node:fs'
import { watch, type FSWatcher } from 'node:fs'
import { normalizePath } from '../../shared/pathUtils'

/**
 * Watcher קל לשורשי תיקיות שהמשתמש עוקב אחריהן.
 *
 * הערה: `fs.watch` לא תמיד מספק old/new path. בשלב ראשון אנחנו משתמשים בו כ-\"hint\"
 * כדי לרענן מודלים/תצוגה, ואת הרזולוציה המדויקת (FileID/Fingerprint) נבצע כשנדרשת.
 */
export class PathWatcherService {
  private readonly watchers: FSWatcher[] = []
  private started = false

  constructor(
    private readonly getTrackedRootFolders: () => string[],
    private readonly onHint: (payload: { root: string; eventType: string; filename?: string }) => void
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.refresh()
  }

  stop(): void {
    this.started = false
    for (const w of this.watchers) {
      try {
        w.close()
      } catch {
        // ignore
      }
    }
    this.watchers.length = 0
  }

  refresh(): void {
    if (!this.started) return
    this.stop()
    this.started = true

    const roots = [...new Set(this.getTrackedRootFolders().map((p) => normalizePath(p)))]
    for (const root of roots) {
      if (!existsSync(root)) continue
      try {
        // On Windows, recursive watch is supported. On other platforms, this may be shallow.
        const w = watch(
          root,
          { recursive: process.platform === 'win32' },
          (eventType, filename) => {
            this.onHint({ root, eventType, filename: filename ? String(filename) : undefined })
          }
        )
        this.watchers.push(w)
      } catch {
        // ignore failing roots (permissions etc.)
      }
    }
  }
}

