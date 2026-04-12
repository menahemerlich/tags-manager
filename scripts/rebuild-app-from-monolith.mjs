import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/renderer/src/App.tsx')
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)

// Monolith: export default function App starts at line 515 (index 514), ends line 2218 (index 2217)
const appFn = lines.slice(514, 2218).join('\n')

const header = `import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import type {
  BlurParams,
  BlurSelection,
  ImportConflictChoice,
  PathKind,
  SearchResultRow,
  TransferPackageProgress,
  TagFolderRow,
  TagImportPreview,
  TagRow,
} from '../../shared/types'
import { normalizeTagName } from '../../shared/tagNormalize'
import {
  createBlurPreviewSource,
  createBlurredPreviewImageData,
  renderBlurPreviewDataUrl,
  type BlurPreviewSource
} from './blurProcessor'
import SyncPage from './pages/Sync/SyncPage'
import { FilePreview } from './components/FilePreview'
import { TagRenameRow } from './components/TagRenameRow'
import { FaceRecognitionTab } from './face/FaceRecognitionTab'
import { WatermarkEditorTab } from './watermark/WatermarkEditorTab'
import { TableVirtuoso } from 'react-virtuoso'
import type { Tab, FaceTab } from './app/appTabs'
import { AppTopBar } from './app/AppTopBar'
import { AppOverlays } from './app/AppOverlays'
import { getFolderAccentStyle, type FolderAccentStyle } from './app/folderAccent'
import { LibraryTabPanel } from './app/panels/LibraryTabPanel'
import { SearchTabPanel } from './app/panels/SearchTabPanel'
import { TagsTabPanel } from './app/panels/TagsTabPanel'
import { SettingsTabPanel, type SettingsView } from './app/panels/SettingsTabPanel'

`

const out = `${header}\n/** שורש האפליקציה: ניווט טאבים, ספרייה, חיפוש, תגיות, הגדרות, פרצופים וסימן מים */\n${appFn}\n`
fs.writeFileSync(appPath, out, 'utf8')
console.log('Rebuilt App.tsx, length', out.split('\\n').length)
