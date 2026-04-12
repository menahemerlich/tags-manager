import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/renderer/src/App.tsx')
let lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)

const wmImportStart = lines.findIndex((l) => l.includes('import WatermarkShapesStage'))
const wmImportEnd = lines.findIndex((l, i) => i > wmImportStart && l.trim() === '} from \'./watermark/watermarkShapeModel\'')
if (wmImportStart < 0 || wmImportEnd < 0) throw new Error('watermark imports not found')
lines.splice(wmImportStart, wmImportEnd - wmImportStart + 1)

const filePreviewIdx = lines.findIndex((l) => l.includes("from './components/FilePreview'"))
lines.splice(filePreviewIdx + 1, 0, "import { WatermarkEditorTab } from './watermark/WatermarkEditorTab'")

const typeWmStart = lines.findIndex((l) => l === "type WatermarkToolMode = 'none' | 'crop' | 'blur' | 'text' | 'shapes'")
const exportAppIdx = lines.findIndex((l) => l.startsWith('export default function App'))
if (typeWmStart < 0 || exportAppIdx < 0) throw new Error('markers not found')
lines.splice(typeWmStart, exportAppIdx - typeWmStart)

const fnWmStart = lines.findIndex((l) => l.startsWith('function WatermarkEditorTab'))
const fnFaceStart = lines.findIndex((l) => l.startsWith('function FaceRecognitionTab'))
if (fnWmStart < 0 || fnFaceStart < 0) throw new Error('WatermarkEditorTab block not found')
lines.splice(fnWmStart, fnFaceStart - fnWmStart)

fs.writeFileSync(appPath, lines.join('\n'), 'utf8')
console.log('Stripped App.tsx, new line count', lines.length)
