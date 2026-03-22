import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { TagDatabase } from './database'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let db: TagDatabase | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'מנהל תגיות',
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

app.whenReady().then(async () => {
  const dbPath = join(app.getPath('userData'), 'tags-manager.sqlite')
  db = await TagDatabase.open(dbPath)
  registerIpcHandlers(
    app,
    () => {
      if (!db) throw new Error('Database not initialized')
      return db
    },
    () => mainWindow
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  db?.close()
  db = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  db?.close()
  db = null
})
