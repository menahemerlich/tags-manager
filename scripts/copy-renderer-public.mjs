import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const srcDir = path.resolve('src', 'renderer', 'public')
const destDir = path.resolve('out', 'renderer')

function copyRecursive(source, target) {
  const stat = statSync(source)
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true })
    for (const entry of readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry))
    }
    return
  }
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(source, target)
}

if (!existsSync(srcDir)) {
  console.log(`[copy-renderer-public] source does not exist: ${srcDir}`)
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
copyRecursive(srcDir, destDir)
console.log(`[copy-renderer-public] copied ${srcDir} -> ${destDir}`)
