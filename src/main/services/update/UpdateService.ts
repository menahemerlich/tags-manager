/**
 * In-app updates via electron-updater only. Feed URL comes from package.json → build.publish (GitHub).
 *
 * Maintainer release workflow:
 * 1. Bump "version" in package.json (semver).
 * 2. Run: npm run build
 * 3. GitHub → new Release for that tag.
 * 4. Attach from release/: NSIS .exe, latest.yml, and .exe.blockmap.
 * 5. Publish. Without latest.yml on the Release, auto-update will not work.
 *
 * CJS interop: electron-updater must be default-imported, then destructure autoUpdater.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, type App, type WebContents } from 'electron'
import electronUpdaterPkg from 'electron-updater'
import type { UpdateFeedMessage } from '../../../shared/types/update.types'
import type { UpdateErrorType } from '../../../shared/types/update.types'
import { UPDATE_FEED } from '../../../shared/constants/ipc-channels'

const { autoUpdater } = electronUpdaterPkg

const LOG_MAX_LINES = 200
const STARTUP_CHECK_DELAY_MS = 10_000

type CheckContext = 'idle' | 'silent' | 'manual'

function sendFeed(wc: WebContents | null | undefined, msg: UpdateFeedMessage): void {
  if (!wc || wc.isDestroyed()) return
  wc.send(UPDATE_FEED, msg)
}

function classifyErrorMessage(message: string): { type: UpdateErrorType; manualMessage: string } {
  const m = typeof message === 'string' ? message : String(message ?? '')
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|ECONNRESET|EPIPE|net::ERR|ERR_NETWORK/i.test(m) ||
    /getaddrinfo|network|socket hang up|fetch failed|Failed to fetch/i.test(m)
  ) {
    return {
      type: 'network',
      manualMessage: 'אין חיבור לאינטרנט. בדוק את החיבור ונסה שנית.'
    }
  }
  if (
    /SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF|certificate|SSL|TLS|CERT_|PKIX/i.test(m)
  ) {
    return {
      type: 'network',
      manualMessage: 'בעיית אבטחת רשת (תעודה). בדוק חיבור, פרוקסי או חומת אש.'
    }
  }
  if (/No published versions on GitHub/i.test(m)) {
    return {
      type: 'server',
      manualMessage:
        'אין ב־GitHub שחרור (Release) מפורסם עבור המאגר שהאפליקציה מצביעה אליו — או שה־owner/repo ב־package.json (build.publish) לא תואם לריפו האמיתי. צור Release ב־GitHub והעלה את קבצי release/ (כולל latest.yml), או תקן את build.publish ובנה מחדש את המתקין.'
    }
  }
  /** Remote / GitHub — must run before any broad `not found` match (e.g. "404 Not Found" was misclassified as local). */
  if (
    /404|403|401|429|500|502|503|HttpError|Unable to find latest|status code|statusCode/i.test(m) ||
    /repository not found|release not found|No assets found|api\.github\.com/i.test(m)
  ) {
    return {
      type: 'server',
      manualMessage:
        'לא ניתן לטעון את מידע העדכון מ־GitHub. ודא שיש Release עם קובץ latest.yml (וה־.exe) כקבצים מצורפים, שהתג תואם לגרסה, וש־build.publish ב־package.json מצביע לריפו הנכון. פרטים ב־userData/update-errors.log.'
    }
  }
  /** Truly local: embedded app-update.yml missing or unreadable (not "404 Not Found" from HTTP). */
  if (
    /app-update\.yml/i.test(m) ||
    /ENOENT[\s\S]{0,400}app-update|app-update[\s\S]{0,400}ENOENT/i.test(m) ||
    /No update info|update info is missing/i.test(m) ||
    (/blockmap/i.test(m) && /ENOENT|EACCES/i.test(m))
  ) {
    return {
      type: 'unknown',
      manualMessage:
        'לא נמצאה הגדרת עדכונים בתוך ההתקנה (קובץ app-update.yml). התקן מה־installer המלא מ־npm run build (לא רק build:vite). אחרי בנייה, העתק את כל קבצי release/ ל־GitHub Release.'
    }
  }
  if (/sha512|checksum|hash|ERR_INVALID|invalid signature/i.test(m)) {
    return {
      type: 'corrupted',
      manualMessage: 'קובץ העדכון פגום. נסה שוב מאוחר יותר.'
    }
  }
  return {
    type: 'unknown',
    manualMessage:
      m.length > 0
        ? `שגיאת עדכון: ${m.slice(0, 200)}${m.length > 200 ? '…' : ''}`
        : 'אירעה שגיאה בלתי צפויה. נסה שנית. (פרטים ב־userData/update-errors.log)'
  }
}

function logUpdateError(app: App, err: Error, errorType: UpdateErrorType | 'AUTO'): void {
  try {
    const logPath = join(app.getPath('userData'), 'update-errors.log')
    const ts = new Date().toISOString()
    const header = `[${ts}] [${errorType}] ${err.message}`
    const body = err.stack ? `\n${err.stack}` : ''
    const line = `${header}${body}\n`
    let content = ''
    if (existsSync(logPath)) {
      content = readFileSync(logPath, 'utf-8')
    }
    const lines = (content + line).split(/\r?\n/)
    const trimmed = lines.length > LOG_MAX_LINES ? lines.slice(-LOG_MAX_LINES).join('\n') : lines.join('\n')
    writeFileSync(logPath, trimmed, 'utf-8')
  } catch {
    /* never throw from logging */
  }
}

export class UpdateService {
  private readonly app: App
  private readonly getWindow: () => BrowserWindow | null
  private checkContext: CheckContext = 'idle'
  private downloading = false
  private listenersAttached = false
  private pendingVersion: string | null = null

  constructor(app: App, getWindow: () => BrowserWindow | null) {
    this.app = app
    this.getWindow = getWindow
  }

  private wc(): WebContents | null | undefined {
    return this.getWindow()?.webContents
  }

  init(): void {
    if (!this.app.isPackaged || this.listenersAttached) return
    this.listenersAttached = true

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('error', (err) => {
      const e = err instanceof Error ? err : new Error(String(err))
      logUpdateError(this.app, e, 'AUTO')
      this.onUpdaterError(e)
    })

    autoUpdater.on('update-available', (info) => {
      void this.onUpdateAvailable(info.version)
    })

    autoUpdater.on('update-not-available', () => {
      this.onUpdateNotAvailable()
    })

    autoUpdater.on('download-progress', (p) => {
      this.downloading = true
      sendFeed(this.wc(), { type: 'download-active', active: true })
      sendFeed(this.wc(), {
        type: 'download-progress',
        percent: p.percent
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.downloading = false
      sendFeed(this.wc(), { type: 'download-active', active: false })
      void this.onUpdateDownloaded(info.version)
    })

    setTimeout(() => {
      void this.runSilentCheck()
    }, STARTUP_CHECK_DELAY_MS)
  }

  private onUpdaterError(err: Error): void {
    const { type, manualMessage } = classifyErrorMessage(err.message)

    if (type === 'corrupted' && this.downloading) {
      this.downloading = false
      sendFeed(this.wc(), { type: 'download-active', active: false })
      void dialog.showMessageBox({
        type: 'error',
        title: 'שגיאת עדכון',
        message: 'קובץ העדכון פגום. נסה שוב מאוחר יותר.',
        buttons: ['אישור']
      })
      this.checkContext = 'idle'
      return
    }

    if (this.downloading) {
      this.downloading = false
      sendFeed(this.wc(), { type: 'download-active', active: false })
      void this.showDownloadInterruptedDialog(err)
      return
    }

    if (this.checkContext === 'manual') {
      this.checkContext = 'idle'
      sendFeed(this.wc(), {
        type: 'manual-check-finished',
        result: 'error',
        message: manualMessage
      })
      return
    }

    if (this.checkContext === 'silent') {
      this.checkContext = 'idle'
    }
  }

  private async showDownloadInterruptedDialog(_err: Error): Promise<void> {
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'הורדה נכשלה',
      message: 'הורדת העדכון נקטעה. האם לנסות שוב?',
      buttons: ['נסה שנית', 'ביטול'],
      defaultId: 0,
      cancelId: 1
    })
    if (r.response === 0) {
      try {
        this.downloading = true
        sendFeed(this.wc(), { type: 'download-active', active: true })
        await autoUpdater.downloadUpdate()
      } catch (e) {
        const er = e instanceof Error ? e : new Error(String(e))
        logUpdateError(this.app, er, 'unknown')
      }
    } else {
      this.checkContext = 'idle'
    }
  }

  private onUpdateNotAvailable(): void {
    if (this.checkContext === 'manual') {
      sendFeed(this.wc(), { type: 'manual-check-finished', result: 'up-to-date' })
    }
    this.checkContext = 'idle'
  }

  private async onUpdateAvailable(version: string): Promise<void> {
    this.pendingVersion = version
    const silent = this.checkContext === 'silent'
    const manual = this.checkContext === 'manual'

    if (manual) {
      sendFeed(this.wc(), { type: 'manual-check-finished', result: 'update-prompt-shown' })
    }

    const box = await dialog.showMessageBox({
      type: 'info',
      title: 'עדכון זמין',
      message: `גרסה ${version} זמינה. האם להוריד ועדכן?`,
      buttons: ['הורד ועדכן', 'לא עכשיו'],
      defaultId: 0,
      cancelId: 1
    })

    if (box.response !== 0) {
      this.pendingVersion = null
      this.checkContext = 'idle'
      return
    }

    try {
      this.downloading = true
      sendFeed(this.wc(), { type: 'download-active', active: true })
      await autoUpdater.downloadUpdate()
    } catch (e) {
      const er = e instanceof Error ? e : new Error(String(e))
      logUpdateError(this.app, er, 'unknown')
      this.downloading = false
      sendFeed(this.wc(), { type: 'download-active', active: false })
      if (!silent && manual) {
        sendFeed(this.wc(), {
          type: 'manual-check-finished',
          result: 'error',
          message: classifyErrorMessage(er.message).manualMessage
        })
      }
      if (silent) {
        /* swallowed */
      }
      this.checkContext = 'idle'
    }
  }

  private async onUpdateDownloaded(version: string): Promise<void> {
    const r = await dialog.showMessageBox({
      type: 'info',
      title: 'העדכון הורד',
      message: 'העדכון מוכן להתקנה. להפעיל מחדש עכשיו?',
      buttons: ['הפעל מחדש', 'לאחר מכן'],
      defaultId: 0,
      cancelId: 1
    })
    this.pendingVersion = null
    this.checkContext = 'idle'
    if (r.response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  }

  async runManualCheck(): Promise<void> {
    if (!this.app.isPackaged) return
    this.checkContext = 'manual'
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      const er = e instanceof Error ? e : new Error(String(e))
      logUpdateError(this.app, er, classifyErrorMessage(er.message).type)
      this.checkContext = 'idle'
      const { manualMessage } = classifyErrorMessage(er.message)
      sendFeed(this.wc(), {
        type: 'manual-check-finished',
        result: 'error',
        message: manualMessage
      })
    }
  }

  private async runSilentCheck(): Promise<void> {
    if (!this.app.isPackaged) return
    this.checkContext = 'silent'
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      const er = e instanceof Error ? e : new Error(String(e))
      logUpdateError(this.app, er, classifyErrorMessage(er.message).type)
      this.checkContext = 'idle'
    }
  }
}

let instance: UpdateService | null = null

export function createUpdateService(app: App, getWindow: () => BrowserWindow | null): UpdateService {
  instance = new UpdateService(app, getWindow)
  return instance
}

export function getUpdateService(): UpdateService | null {
  return instance
}
