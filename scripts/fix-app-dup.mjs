import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/renderer/src/App.tsx')
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)

// 1-based line numbers from analysis: remove duplicate cloud-sync + old settings (858-1127)
// Remove lines 858–1127 (duplicate cloud-sync + old settings block)
const next = [...lines.slice(0, 857), ...lines.slice(1127)]
fs.writeFileSync(appPath, next.join('\n') + (next[next.length - 1].endsWith('\n') ? '' : '\n'))
console.log('removed duplicate block')
