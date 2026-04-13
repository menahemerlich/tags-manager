import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions, type WebContents } from 'electron'
import type { App } from 'electron'
import { TagDatabase } from './database'
import { indexFolderFiles } from './fileIndexer'
import { loadSettings, saveSettings } from './settingsStore'
import type {
  AppSettings,
  FaceAddEmbeddingPayload,
  FaceDetectionWithCandidate,
  FaceReplaceEmbeddingPayload,
  ImportUserDataResult,
  PackageAppForTransferOptions,
  PackageAppForTransferResult,
  TagExportJson,
  TagImportApplyPayload,
  TransferPackageProgress,
  VideoTrimSegmentPayload,
  VideoTrimSegmentResult,
  WatermarkBakeToolPayload,
  WatermarkExportPayload,
  WatermarkPreviewPayload,
  WatermarkVideoExportPayload
} from '../shared/types'
import { normalizePath, sanitizePathInput, toWindowsShellPath } from '../shared/pathUtils'
import { normalizeTagName } from '../shared/tagNormalize'
import type { PathKind } from '../shared/types'
import { analyzeImageWithOnnx } from './faceEngine'
import { FACE_EMBEDDING_MODEL_ID } from '../shared/types'
import {
  bakeWatermarkToolToDataUrl,
  defaultWatermarkedFilePath,
  exportWatermarkedImage,
  renderWatermarkPreviewDataUrl
} from './watermark'
import {
  defaultWatermarkedVideoPath,
  exportWatermarkedVideoSegment,
  trimVideoSegmentToTempFile
} from './watermarkVideo'
import { registerSupabaseSyncIpc } from './ipc/sync.ipc'
import { registerMediaIpc } from './ipc/media.ipc'
import { tryResolveMediaFsPath } from './services/media/resolveMediaFsPath'
import {
  DATA_RELOAD_USER_DATA,
  WATERMARK_IMAGE_EXPORT_BUSY,
  WATERMARK_VIDEO_EXPORT_PROGRESS
} from '../shared/constants/ipc-channels'
import { registerUpdateIpc } from './ipc/update.ipc'

let indexAbort: AbortController | null = null

function mimeFromFilePath(filePath: string): string {
  const p = filePath.toLowerCase()
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.bmp')) return 'image/bmp'
  return 'application/octet-stream'
}

function isExternalImageRef(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value)
}

async function showOpenDialogForWindow(win: BrowserWindow | null, options: OpenDialogOptions) {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

async function showSaveDialogForWindow(win: BrowserWindow | null, options: SaveDialogOptions) {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}

function emitTransferPackageProgress(
  wc: WebContents | undefined,
  payload: TransferPackageProgress
): void {
  wc?.send('transfer-package:progress', payload)
}

function resolveProjectRoot(app: App): string | null {
  const candidates = [
    process.cwd(),
    app.getAppPath(),
    resolve(app.getAppPath(), '..'),
    resolve(app.getAppPath(), '..', '..'),
    resolve(process.execPath, '..', '..'),
    resolve(process.execPath, '..', '..', '..')
  ]
  for (const dir of [...new Set(candidates)]) {
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return null
}

function validateTransferPackagingInputs(projectRoot: string): void {
  const requiredFiles = [
    { path: join(projectRoot, 'package.json'), label: 'package.json' },
    { path: join(projectRoot, 'build', 'icon.png'), label: 'build/icon.png' },
    { path: join(projectRoot, 'src', 'renderer', 'public', 'icon.png'), label: 'src/renderer/public/icon.png' },
    { path: join(projectRoot, 'resources', 'models', 'face', 'scrfd.onnx'), label: 'resources/models/face/scrfd.onnx' },
    { path: join(projectRoot, 'resources', 'models', 'face', 'arcface.onnx'), label: 'resources/models/face/arcface.onnx' }
  ]
  const missing = requiredFiles.filter((entry) => !existsSync(entry.path))
  if (missing.length > 0) {
    throw new Error(`חסרים קבצים לאריזה: ${missing.map((entry) => entry.label).join(', ')}`)
  }

  const legacyModelsDir = join(projectRoot, 'src', 'renderer', 'public', 'face-models')
  const legacyModelFiles = existsSync(legacyModelsDir)
    ? readdirSync(legacyModelsDir).filter((name) => !name.startsWith('.'))
    : []
  if (legacyModelFiles.length === 0) {
    throw new Error('חסרים קבצי face-api בתיקיית src/renderer/public/face-models')
  }
}

async function runNpmBuild(
  projectRoot: string,
  onProgress?: (payload: TransferPackageProgress) => void
): Promise<void> {
  const command =
    process.platform === 'win32'
      ? process.env['ComSpec'] || 'C:\\Windows\\System32\\cmd.exe'
      : 'npm'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build']
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true
    })
    let stderr = ''
    let lastDetail = ''
    child.stdout.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (!text) return
      lastDetail = text
      onProgress?.({
        stage: 'building',
        message: 'בונה את ההתקנה...',
        detail: text
      })
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      stderr += text
      const trimmed = text.trim()
      if (!trimmed) return
      lastDetail = trimmed
      onProgress?.({
        stage: 'building',
        message: 'בונה את ההתקנה...',
        detail: trimmed
      })
    })
    child.on('error', (error) => {
      rejectPromise(new Error(`לא ניתן להריץ npm build: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const reason = stderr.trim()
      rejectPromise(
        new Error(reason ? `הבנייה נכשלה: ${reason}` : `הבנייה נכשלה עם קוד ${code ?? 'לא ידוע'}${lastDetail ? `\n${lastDetail}` : ''}`)
      )
    })
  })
}

function findLatestInstaller(releaseDir: string): string | null {
  if (!existsSync(releaseDir)) return null
  const exeFiles = readdirSync(releaseDir)
    .map((name) => join(releaseDir, name))
    .filter((filePath) => filePath.toLowerCase().endsWith('.exe'))
    .filter((filePath) => statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return exeFiles[0] ?? null
}

function findLatestInstallerInDirectory(dirPath: string): string | null {
  if (!existsSync(dirPath)) return null
  const exeFiles = readdirSync(dirPath)
    .map((name) => join(dirPath, name))
    .filter((filePath) => filePath.toLowerCase().endsWith('.exe'))
    .filter((filePath) => statSync(filePath).isFile())
    .filter((filePath) => {
      const lower = basename(filePath).toLowerCase()
      if (lower.startsWith('uninstall')) return false
      if (normalizePath(filePath).toLowerCase() === normalizePath(process.execPath).toLowerCase()) return false
      return true
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return exeFiles[0] ?? null
}

async function chooseExistingInstaller(win: BrowserWindow | null): Promise<string | null> {
  const result = await showOpenDialogForWindow(win, {
    title: 'בחר קובץ מתקין קיים',
    properties: ['openFile'],
    filters: [{ name: 'Windows Installer', extensions: ['exe'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return normalizePath(result.filePaths[0] as string)
}

function buildTransferInstructions(app: App, installerName: string, copiedFiles: string[], missingFiles: string[]): string {
  const userDataDirName = basename(app.getPath('userData'))
  const copiedLine = copiedFiles.length > 0 ? copiedFiles.join(', ') : 'לא נכללו קבצי נתונים.'
  const missingLine = missingFiles.length > 0 ? missingFiles.join(', ') : 'אין'
  const vcRedistUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
  return [
    'חבילת העברה למחשב אחר',
    '',
    'מה יש כאן:',
    `- installer\\${installerName}`,
    `- user-data\\ (${copiedLine})`,
    '',
    'שלבי עבודה במחשב היעד:',
    '1. הרץ את קובץ ההתקנה שבתיקיית installer.',
    '2. פתח את התוכנה פעם אחת וסגור אותה.',
    '3. היכנס להגדרות > העברה ולחץ על הכפתור לפתיחת תיקיית נתוני האפליקציה.',
    `4. אם צריך ידנית, מיקום התיקייה הוא בדרך כלל: %APPDATA%\\${userDataDirName}`,
    '5. העתק את הקבצים מתיקיית user-data אל תיקיית הנתונים שנפתחה.',
    '6. אשר החלפה של קבצים אם תתבקש.',
    '',
    `קבצי userData שלא נמצאו בזמן האריזה: ${missingLine}`,
    '',
    'אם זיהוי הפנים לא עובד במחשב היעד, ודא שמותקן Microsoft Visual C++ Redistributable (x64).',
    `הורדה ישירה: ${vcRedistUrl}`
  ].join('\r\n')
}

async function packageAppForTransfer(
  app: App,
  db: TagDatabase,
  win: BrowserWindow | null,
  options: PackageAppForTransferOptions
): Promise<PackageAppForTransferResult> {
  const wc = win?.webContents
  emitTransferPackageProgress(wc, {
    stage: 'select-destination',
    message: 'ממתין לבחירת תיקיית יעד...'
  })
  const destination = await showOpenDialogForWindow(win, {
    title: 'בחר תיקייה ליצירת חבילת העברה',
    properties: ['openDirectory', 'createDirectory']
  })
  if (destination.canceled || destination.filePaths.length === 0) {
    return { ok: false, cancelled: true }
  }

  const projectRoot = resolveProjectRoot(app)

  try {
    emitTransferPackageProgress(wc, {
      stage: 'persisting-data',
      message: 'שומר את נתוני המשתמש לפני ההעתקה...'
    })
    db.persistNow()
    let installerStrategy: 'existing' | 'rebuilt' = options.rebuildInstaller ? 'rebuilt' : 'existing'
    let installerSourcePath: string | null = null

    if (options.rebuildInstaller) {
      if (!projectRoot) {
        throw new Error('בניית מתקין חדש אפשרית רק מתוך סביבת הפרויקט. מתוך ההתקנה השתמש במתקין קיים.')
      }
      emitTransferPackageProgress(wc, {
        stage: 'validating',
        message: 'בודק שקיימים כל הקבצים הנדרשים לבניית מתקין חדש...'
      })
      validateTransferPackagingInputs(projectRoot)
      emitTransferPackageProgress(wc, {
        stage: 'building',
        message: 'מריץ build מלא של ההתקנה...'
      })
      await runNpmBuild(projectRoot, (payload) => emitTransferPackageProgress(wc, payload))
      installerSourcePath = findLatestInstaller(join(projectRoot, 'release'))
    } else {
      emitTransferPackageProgress(wc, {
        stage: 'searching-installer',
        message: 'מחפש מתקין קיים לשימוש מהיר...'
      })
      if (projectRoot) {
        installerSourcePath = findLatestInstaller(join(projectRoot, 'release'))
      }
      installerSourcePath = installerSourcePath ?? findLatestInstallerInDirectory(dirname(process.execPath))
      if (!installerSourcePath) {
        emitTransferPackageProgress(wc, {
          stage: 'searching-installer',
          message: 'לא נמצא מתקין קיים אוטומטית. בחר קובץ מתקין קיים...'
        })
        installerSourcePath = await chooseExistingInstaller(win)
      }
      if (!installerSourcePath && projectRoot) {
        installerStrategy = 'rebuilt'
        emitTransferPackageProgress(wc, {
          stage: 'validating',
          message: 'לא נמצא מתקין קיים. בודק קבצים לבניית מתקין חדש...'
        })
        validateTransferPackagingInputs(projectRoot)
        emitTransferPackageProgress(wc, {
          stage: 'building',
          message: 'לא נמצא מתקין קיים, בונה מתקין חדש...'
        })
        await runNpmBuild(projectRoot, (payload) => emitTransferPackageProgress(wc, payload))
        installerSourcePath = findLatestInstaller(join(projectRoot, 'release'))
      }
    }

    if (!installerSourcePath) {
      return { ok: false, cancelled: true }
    }

    emitTransferPackageProgress(wc, {
      stage: 'collecting-installer',
      message: installerStrategy === 'existing' ? 'אוסף את קובץ ההתקנה הקיים...' : 'מאתר את קובץ ההתקנה שנוצר...'
    })
    if (!installerSourcePath) {
      throw new Error('לא נמצא קובץ מתקין בתיקיית release לאחר הבנייה')
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    const bundleDir = join(destination.filePaths[0] as string, `tags-manager-transfer-${timestamp}`)
    const installerDir = join(bundleDir, 'installer')
    const userDataBundleDir = join(bundleDir, 'user-data')
    mkdirSync(installerDir, { recursive: true })
    mkdirSync(userDataBundleDir, { recursive: true })

    emitTransferPackageProgress(wc, {
      stage: 'copying-data',
      message: 'מעתיק את קובץ ההתקנה ואת נתוני המשתמש...'
    })
    const installerPath = join(installerDir, basename(installerSourcePath))
    copyFileSync(installerSourcePath, installerPath)

    const copiedUserDataFiles: string[] = []
    const missingUserDataFiles: string[] = []
    for (const name of ['tags-manager.sqlite', 'settings.json']) {
      const sourcePath = join(app.getPath('userData'), name)
      if (!existsSync(sourcePath)) {
        missingUserDataFiles.push(name)
        continue
      }
      copyFileSync(sourcePath, join(userDataBundleDir, name))
      copiedUserDataFiles.push(name)
    }

    emitTransferPackageProgress(wc, {
      stage: 'writing-instructions',
      message: 'יוצר קובץ הוראות ומאמת את תוכן החבילה...'
    })
    const instructionsPath = join(bundleDir, 'README-transfer.txt')
    writeFileSync(
      instructionsPath,
      buildTransferInstructions(app, basename(installerPath), copiedUserDataFiles, missingUserDataFiles),
      'utf-8'
    )

    if (!existsSync(installerPath) || !existsSync(instructionsPath)) {
      throw new Error('אימות החבילה נכשל: חסר קובץ מתקין או README')
    }

    return {
      ok: true,
      bundleDir,
      installerPath,
      instructionsPath,
      copiedUserDataFiles,
      missingUserDataFiles,
      installerStrategy
    }
  } catch (error) {
    emitTransferPackageProgress(wc, {
      stage: 'error',
      message: 'האריזה נכשלה',
      detail: error instanceof Error ? error.message : String(error)
    })
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function parseImportJson(raw: string): TagExportJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('קובץ JSON לא תקין')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('מבנה JSON לא תקין')
  const obj = parsed as Partial<TagExportJson>
  if (obj.format !== 'tags-manager-export-v1') throw new Error('פורמט קובץ לא נתמך')
  if (!Array.isArray(obj.entries)) throw new Error('רשומות ייבוא חסרות או לא תקינות')
  for (const entry of obj.entries) {
    if (!entry || typeof entry !== 'object') throw new Error('רשומת ייבוא לא תקינה')
    const e = entry as { path?: unknown; kind?: unknown; directTags?: unknown; excludedInheritedTags?: unknown }
    if (typeof e.path !== 'string' || !e.path.trim()) throw new Error('רשומת ייבוא כוללת נתיב לא תקין')
    if (e.kind !== 'file' && e.kind !== 'folder') throw new Error('סוג רשומה לא תקין')
    if (!Array.isArray(e.directTags) || !Array.isArray(e.excludedInheritedTags)) {
      throw new Error('רשומת ייבוא כוללת שדות תגיות לא תקינים')
    }
  }
  return obj as TagExportJson
}

export function registerIpcHandlers(
  app: App,
  getDb: () => TagDatabase,
  getWindow: () => BrowserWindow | null
): void {
  registerSupabaseSyncIpc(app, getDb, getWindow)
  registerMediaIpc(app)
  registerUpdateIpc(app, getWindow)

  const sendProgress = (wc: WebContents | undefined, payload: { done: number; total: number; currentPath: string }) => {
    wc?.send('index:progress', payload)
  }

  ipcMain.handle(
    'paths:add-items',
    async (
      _evt,
      payload: { items: { path: string; kind: PathKind }[]; tagNames: string[] }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const db = getDb()
      const win = getWindow()
      indexAbort?.abort()
      indexAbort = new AbortController()
      const signal = indexAbort.signal

      try {
        for (const item of payload.items) {
          const raw = sanitizePathInput(item.path)
          if (!raw) throw new Error('נתיב ריק')
          const p = normalizePath(raw)
          if (item.kind !== 'file' && item.kind !== 'folder') {
            throw new Error('סוג פריט לא תקין')
          }
          if (item.kind === 'file') {
            db.setPathTags(p, payload.tagNames, 'file')
          } else {
            /** מחוץ ל־bulk: שמירת התיקייה והתגיות מתבצעת בלי אותו transaction של האינדוקס (מניעת אובדן/בלבול מצב). */
            db.setPathTags(p, payload.tagNames, 'folder')
            db.persistNow()
            db.beginBulkMode()
            try {
              await indexFolderFiles(
                { folderPath: p, signal, onProgress: (prog) => sendProgress(win?.webContents, prog) },
                (filePath) => {
                  const nf = normalizePath(filePath)
                  /** מונע דריסת שורת התיקייה ל־`file` אם נתיב הקובץ מזוהה בטעות עם שורש התיקייה. */
                  if (nf === p) return
                  db.upsertPath(nf, 'file')
                }
              )
            } finally {
              db.endBulkMode()
            }
            try {
              /** אם שורת הנתיב סומנה בטעות כקובץ, מחזירים `folder` כדי שחיפוש/סינון תיקיות יעבדו. */
              if (existsSync(p) && statSync(p).isDirectory()) {
                db.upsertPath(p, 'folder')
              }
            } catch {
              /* נתיב לא זמין — לא חוסמים שמירה */
            }
            db.setPathTags(p, payload.tagNames, 'folder')
            db.persistNow()
          }
        }
        return { ok: true as const }
      } catch (e) {
        const err = e as Error
        if (err.name === 'AbortError') return { ok: false, error: 'האינדוקס בוטל' }
        return { ok: false, error: err.message || String(e) }
      }
    }
  )

  ipcMain.handle('paths:cancel-index', async () => {
    indexAbort?.abort()
    return { ok: true as const }
  })

  ipcMain.handle('paths:list', async () => {
    const rows = getDb().listUserVisiblePathsWithDirectTags()
    /** נתיב אחיד (ניקוי bidi/NFC/מפרידים) כדי שלא יישבר עם עברית ב־RTL. */
    return rows.map((r) => ({ ...r, path: normalizePath(r.path) }))
  })

  ipcMain.handle('paths:get-tags', async (_e, path: string) => {
    return getDb().getDirectTagNamesForPath(normalizePath(path))
  })

  ipcMain.handle('paths:get-effective-tags', async (_e, path: string) => {
    return getDb().getEffectiveTagNamesForPath(normalizePath(path))
  })

  ipcMain.handle('paths:add-tag', async (_e, payload: { path: string; tagName: string }) => {
    const db = getDb()
    const p = normalizePath(payload.path)
    const kind = db.getPathKind(p) ?? 'file'
    const pathId = db.upsertPath(p, kind)
    const t = db.getOrCreateTag(payload.tagName)
    db.addTagToPath(pathId, t.id)
    return { ok: true as const }
  })

  ipcMain.handle('paths:remove-tag', async (_e, payload: { path: string; tagName: string }) => {
    const db = getDb()
    const p = normalizePath(payload.path)
    const kind = db.getPathKind(p) ?? 'file'
    const pathId = db.upsertPath(p, kind)
    const tagId = db.getTagIdByName(payload.tagName)
    if (tagId === undefined) return { ok: false as const, error: 'התגית לא נמצאה' }
    const direct = db.getDirectTagNamesForPathId(pathId)
    const hasDirect = direct.some((n) => n.toLowerCase() === payload.tagName.toLowerCase())
    if (hasDirect) {
      db.removeTagFromPath(pathId, tagId)
    } else {
      db.addExclusionToPath(pathId, tagId)
    }
    return { ok: true as const }
  })

  ipcMain.handle('tags:list', async () => {
    return getDb().listTags()
  })

  ipcMain.handle('tag-folders:list', async () => {
    return getDb().listTagFolders()
  })

  ipcMain.handle('tag-folders:create', async (_e, name: string) => {
    try {
      const id = getDb().createTagFolder(name)
      return { ok: true as const, id }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('tag-folders:delete', async (_e, id: number) => {
    getDb().deleteTagFolder(id)
    return { ok: true as const }
  })

  ipcMain.handle('tag-folders:set-tag-folder', async (_e, payload: { tagId: number; folderId: number | null }) => {
    try {
      getDb().setTagFolderForTag(payload.tagId, payload.folderId)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('tags:rename', async (_e, payload: { id: number; name: string }) => {
    try {
      getDb().renameTag(payload.id, payload.name)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:delete', async (_e, id: number) => {
    getDb().deleteTag(id)
    return { ok: true as const }
  })

  ipcMain.handle('faces:get-people-embeddings', async () => {
    return getDb().listFacePeopleEmbeddings()
  })

  ipcMain.handle('faces:add-embedding', async (_e, payload: FaceAddEmbeddingPayload) => {
    try {
      if (payload.modelId !== FACE_EMBEDDING_MODEL_ID) {
        return { ok: false as const, error: 'ניתן לשמור embedding רק ממודל ONNX הפעיל' }
      }
      getDb().addFaceEmbedding(payload)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('faces:analyze-and-match-image', async (_e, imagePath: string) => {
    try {
      const s = sanitizePathInput(imagePath)
      const p = tryResolveMediaFsPath(s) ?? normalizePath(s)
      const faces = await analyzeImageWithOnnx(p)
      const matches = getDb().matchFaceDescriptors(
        faces.map((f) => f.descriptor),
        FACE_EMBEDDING_MODEL_ID
      )
      const merged: FaceDetectionWithCandidate[] = faces.map((face, i) => ({
        ...face,
        candidate: matches[i] ?? null
      }))
      return { ok: true as const, modelId: FACE_EMBEDDING_MODEL_ID, faces: merged }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('faces:analyze-image', async (_e, imagePath: string) => {
    try {
      const s = sanitizePathInput(imagePath)
      const p = tryResolveMediaFsPath(s) ?? normalizePath(s)
      const faces = await analyzeImageWithOnnx(p)
      return { ok: true as const, faces }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('faces:list-embeddings-meta', async () => {
    return getDb().listFaceEmbeddingsMeta()
  })

  ipcMain.handle('faces:replace-embedding', async (_e, payload: FaceReplaceEmbeddingPayload) => {
    try {
      if (payload.modelId !== FACE_EMBEDDING_MODEL_ID) {
        return { ok: false as const, error: 'החלפת embedding מותרת רק למודל ONNX הפעיל' }
      }
      getDb().replaceFaceEmbedding(payload)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('tags:export-json', async (_e, scopePath: string) => {
    try {
      const normalizedScope = normalizePath(scopePath)
      const exportData = getDb().exportTagJsonByScope(normalizedScope)
      const win = getWindow()
      const suggestedBase = normalizedScope.replace(/[:\\\/]+/g, '_')
      const saveRes = await showSaveDialogForWindow(win, {
        title: 'ייצוא תגיות',
        defaultPath: `tags-export-${suggestedBase}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: false as const, cancelled: true as const }
      writeFileSync(saveRes.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return { ok: true as const, filePath: saveRes.filePath, exportedCount: exportData.entries.length }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:import-preview', async (_e, scopePath: string) => {
    const win = getWindow()
    const pickRes = await showOpenDialogForWindow(win, {
      title: 'ייבוא תגיות',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (pickRes.canceled || pickRes.filePaths.length === 0) return { ok: false as const, cancelled: true as const }
    try {
      const sourceFilePath = pickRes.filePaths[0] as string
      const raw = readFileSync(sourceFilePath, 'utf-8')
      const data = parseImportJson(raw)
      const preview = getDb().previewImportByScope(data, normalizePath(scopePath))
      return { ok: true as const, preview: { ...preview, sourceFilePath } }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })

  ipcMain.handle('tags:import-apply', async (_e, payload: TagImportApplyPayload) => {
    try {
      const db = getDb()
      const win = getWindow()
      const wc = win?.webContents
      db.beginBulkMode()
      const raw = readFileSync(payload.sourceFilePath, 'utf-8')
      const data = parseImportJson(raw)
      const result = await db.applyImportByScope(data, payload, {
        onProgress: (p) => wc?.send('import:progress', p)
      })
      return { ok: true as const, ...result }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    } finally {
      try {
        getDb().endBulkMode()
      } catch {
        // ignore
      }
    }
  })

  ipcMain.handle('search:query', async (_e, tagNames: string[]) => {
    const db = getDb()
    const normalized = tagNames.map((n) => normalizeTagName(n)).filter(Boolean)
    if (normalized.length === 0) return { rows: [], truncated: false }
    const ids: number[] = []
    for (const name of normalized) {
      const id = db.getTagIdByName(name)
      if (id === undefined) return { rows: [], truncated: false }
      ids.push(id)
    }
    return db.searchFilesByTagIds(ids)
  })

  ipcMain.handle('settings:get', async () => {
    return loadSettings(app)
  })

  ipcMain.handle('settings:set', async (_e, s: AppSettings) => {
    const current = loadSettings(app)
    saveSettings(app, {
      sync: { ...current.sync, ...s.sync }
    })
    return { ok: true as const }
  })

  ipcMain.handle('app:package-for-transfer', async (_e, options: PackageAppForTransferOptions) => {
    return packageAppForTransfer(app, getDb(), getWindow(), {
      rebuildInstaller: Boolean(options?.rebuildInstaller)
    })
  })

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion()
  })

  ipcMain.handle(DATA_RELOAD_USER_DATA, async () => {
    try {
      await getDb().reloadFromDisk()
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle('app:open-user-data-dir', async () => {
    const userDataDir = app.getPath('userData')
    await shell.openPath(userDataDir)
    return userDataDir
  })

  ipcMain.handle('app:import-user-data', async (): Promise<ImportUserDataResult> => {
    const win = getWindow()
    const picked = await showOpenDialogForWindow(win, {
      title: 'בחר קבצי נתוני אפליקציה לטעינה',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'User Data', extensions: ['sqlite', 'json'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, cancelled: true }
    }

    const sqliteSource = picked.filePaths.find((fp) => basename(fp).toLowerCase() === 'tags-manager.sqlite')
    if (!sqliteSource) {
      return { ok: false, error: 'יש לבחור את הקובץ tags-manager.sqlite כדי לטעון תגיות ונתוני פנים.' }
    }

    try {
      const db = getDb()
      db.persistNow()
      const userDataDir = app.getPath('userData')
      mkdirSync(userDataDir, { recursive: true })

      const copiedFiles: string[] = []
      copyFileSync(normalizePath(sqliteSource), join(userDataDir, 'tags-manager.sqlite'))
      copiedFiles.push('tags-manager.sqlite')

      const settingsSource = picked.filePaths.find((fp) => basename(fp).toLowerCase() === 'settings.json')
      if (settingsSource) {
        copyFileSync(normalizePath(settingsSource), join(userDataDir, 'settings.json'))
        copiedFiles.push('settings.json')
      }

      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 150)

      return {
        ok: true,
        copiedFiles,
        userDataDir,
        restartScheduled: true
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('shell:show-in-folder', async (_e, filePath: string) => {
    const s = sanitizePathInput(filePath)
    if (!s) return
    const fsPath = tryResolveMediaFsPath(s) ?? normalizePath(s)
    shell.showItemInFolder(toWindowsShellPath(fsPath))
  })

  ipcMain.handle('shell:open-path', async (_e, filePath: string) => {
    const s = sanitizePathInput(filePath)
    if (!s) return 'empty path'
    const fsPath = tryResolveMediaFsPath(s) ?? normalizePath(s)
    return await shell.openPath(toWindowsShellPath(fsPath))
  })

  ipcMain.handle('dialog:pick-files', async () => {
    const win = getWindow()
    const r = await showOpenDialogForWindow(win, {
      title: 'בחר קבצים',
      properties: ['openFile', 'multiSelections']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths.map((fp) => ({ path: normalizePath(fp), kind: 'file' as PathKind }))
  })

  ipcMain.handle('dialog:pick-folders', async () => {
    const win = getWindow()
    const r = await showOpenDialogForWindow(win, {
      title: 'בחר תיקיות',
      properties: ['openDirectory', 'multiSelections']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths.map((fp) => ({ path: normalizePath(fp), kind: 'folder' as PathKind }))
  })

  ipcMain.handle('dialog:pick-folder', async () => {
    const win = getWindow()
    const r = await showOpenDialogForWindow(win, {
      title: 'בחר תיקייה לחיפוש',
      properties: ['openDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return normalizePath(r.filePaths[0] as string)
  })

  ipcMain.handle('dialog:pick-image', async () => {
    const win = getWindow()
    const r = await showOpenDialogForWindow(win, {
      title: 'בחר תמונה',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }
      ]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0] as string
  })

  ipcMain.handle('dialog:pick-watermark-base', async () => {
    const win = getWindow()
    const r = await showOpenDialogForWindow(win, {
      title: 'בחר תמונה או סרטון',
      properties: ['openFile'],
      filters: [
        {
          name: 'תמונה או וידאו',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']
        }
      ]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0] as string
  })

  ipcMain.handle('files:image-data-url', async (_e, filePath: string) => {
    try {
      const s = sanitizePathInput(filePath)
      if (!s) return null
      const p = tryResolveMediaFsPath(s) ?? normalizePath(s)
      const bytes = readFileSync(p)
      const mime = mimeFromFilePath(p)
      return `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('images:render-watermark-preview', async (_e, payload: WatermarkPreviewPayload) => {
    try {
      const s = sanitizePathInput(payload.baseImagePath)
      if (!s) return null
      const baseImagePath = tryResolveMediaFsPath(s) ?? normalizePath(s)
      return await renderWatermarkPreviewDataUrl({
        ...payload,
        baseImagePath
      })
    } catch {
      return null
    }
  })

  ipcMain.handle('images:bake-watermark-tool', async (_e, payload: WatermarkBakeToolPayload) => {
    try {
      const dataUrl =
        typeof payload.baseImageDataUrl === 'string' && payload.baseImageDataUrl.startsWith('data:image/')
          ? payload.baseImageDataUrl
          : undefined
      const pathRaw = !dataUrl ? sanitizePathInput(payload.baseImagePath ?? '') : ''
      if (!dataUrl && !pathRaw) return null
      const baseImagePath = pathRaw ? tryResolveMediaFsPath(pathRaw) ?? normalizePath(pathRaw) : undefined
      return await bakeWatermarkToolToDataUrl({
        ...payload,
        baseImagePath,
        baseImageDataUrl: dataUrl
      })
    } catch {
      return null
    }
  })

  ipcMain.handle('images:export-watermarked', async (event, payload: WatermarkExportPayload) => {
    const win = getWindow()
    try {
      const baseS = sanitizePathInput(payload.baseImagePath)
      if (!baseS) return { ok: false as const, error: 'נתיב תמונה ראשית חסר' }
      const baseImagePath = tryResolveMediaFsPath(baseS) ?? normalizePath(baseS)
      const saveRes = await showSaveDialogForWindow(win, {
        title: 'ייצוא תמונה עם סימן מים',
        defaultPath: defaultWatermarkedFilePath(baseImagePath),
        filters: [
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
          { name: 'BMP', extensions: ['bmp'] }
        ]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: false as const, cancelled: true as const }
      if (!event.sender.isDestroyed()) {
        event.sender.send(WATERMARK_IMAGE_EXPORT_BUSY, {
          outputBaseName: basename(saveRes.filePath)
        })
      }
      const wmRaw = sanitizePathInput(
        typeof payload.watermarkImagePath === 'string' ? payload.watermarkImagePath : ''
      )
      const watermarkResolved =
        isExternalImageRef(payload.watermarkImagePath) || !wmRaw
          ? payload.watermarkImagePath
          : tryResolveMediaFsPath(wmRaw) ?? normalizePath(wmRaw)

      await exportWatermarkedImage({
        ...payload,
        baseImagePath,
        watermarkImagePath: watermarkResolved,
        outputPath: normalizePath(saveRes.filePath)
      })
      return { ok: true as const, filePath: saveRes.filePath }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('videos:export-watermarked', async (event, payload: WatermarkVideoExportPayload) => {
    const win = getWindow()
    try {
      const baseS = sanitizePathInput(payload.baseVideoPath)
      if (!baseS) return { ok: false as const, error: 'נתיב וידאו חסר' }
      const baseVideoPath = tryResolveMediaFsPath(baseS) ?? normalizePath(baseS)
      const wmRaw = sanitizePathInput(
        typeof payload.watermarkImagePath === 'string' ? payload.watermarkImagePath : ''
      )
      const watermarkResolved =
        isExternalImageRef(payload.watermarkImagePath) || !wmRaw
          ? payload.watermarkImagePath
          : tryResolveMediaFsPath(wmRaw) ?? normalizePath(wmRaw)

      const saveRes = await showSaveDialogForWindow(win, {
        title: 'שמירת סרט עם סימן מים',
        defaultPath: defaultWatermarkedVideoPath(baseVideoPath),
        filters: [{ name: 'MP4', extensions: ['mp4'] }]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: false as const, cancelled: true as const }

      if (!event.sender.isDestroyed()) {
        event.sender.send(WATERMARK_VIDEO_EXPORT_PROGRESS, {
          percent: 0,
          outputBaseName: basename(saveRes.filePath)
        })
      }

      await exportWatermarkedVideoSegment(app, {
        baseVideoPath,
        watermarkImagePath: typeof watermarkResolved === 'string' ? watermarkResolved : wmRaw,
        outputPath: normalizePath(saveRes.filePath),
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        opacity: payload.opacity,
        startSec: payload.startSec,
        endSec: payload.endSec,
        textOverlay: payload.textOverlay,
        shapeOverlays: payload.shapeOverlays,
        onProgress: ({ percent }) => {
          if (event.sender.isDestroyed()) return
          event.sender.send(WATERMARK_VIDEO_EXPORT_PROGRESS, { percent })
        }
      })
      return { ok: true as const, filePath: saveRes.filePath }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })

  ipcMain.handle('videos:trim-segment', async (_e, payload: VideoTrimSegmentPayload): Promise<VideoTrimSegmentResult> => {
    try {
      const raw = sanitizePathInput(payload.inputPath)
      if (!raw) return { ok: false as const, error: 'נתיב חסר' }
      const inputPath = tryResolveMediaFsPath(raw) ?? normalizePath(raw)
      const out = await trimVideoSegmentToTempFile(app, inputPath, payload.startSec, payload.endSec)
      return { ok: true as const, outputPath: out }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || String(e) }
    }
  })
}
