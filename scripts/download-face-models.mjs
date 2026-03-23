import { promises as fs } from 'node:fs'
import path from 'node:path'

const version = '0.22.2'
const baseUrl = `https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@${version}/weights/`

const destDir = path.resolve('src/renderer/public/face-models')

const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
]

// Rough size guards to avoid “zero-byte/partial download” states.
const minBytes = {
  // manifests
  'ssd_mobilenetv1_model-weights_manifest.json': 5_000,
  'face_landmark_68_model-weights_manifest.json': 2_000,
  'face_recognition_model-weights_manifest.json': 5_000,
  // shards
  'ssd_mobilenetv1_model-shard1': 100_000,
  'ssd_mobilenetv1_model-shard2': 50_000,
  'face_landmark_68_model-shard1': 50_000,
  'face_recognition_model-shard1': 100_000,
  'face_recognition_model-shard2': 50_000
}

function requiredFileList() {
  return files.map((f) => path.join(destDir, f))
}

async function fileLooksValid(filePath, fileName) {
  try {
    const st = await fs.stat(filePath)
    const min = minBytes[fileName] ?? 1
    return st.size >= min
  } catch {
    return false
  }
}

async function ensureDir() {
  await fs.mkdir(destDir, { recursive: true })
}

async function downloadOne(fileName) {
  const url = baseUrl + fileName
  const outPath = path.join(destDir, fileName)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${fileName}: ${res.status} ${res.statusText}`)

  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(outPath, buf)
}

async function main() {
  await ensureDir()

  const missing = []
  for (const f of files) {
    const outPath = path.join(destDir, f)
    // If size is too small, treat it as missing.
    // (This prevents the app from failing due to truncated downloads.)
    // eslint-disable-next-line no-await-in-loop
    const ok = await fileLooksValid(outPath, f)
    if (!ok) missing.push(f)
  }

  if (missing.length > 0) {
    console.log(`[face-models] Downloading ${missing.length} file(s) to ${destDir}`)
    for (const f of missing) {
      // eslint-disable-next-line no-await-in-loop
      await downloadOne(f)
    }
  } else {
    console.log(`[face-models] All model files already present; skipping download.`)
  }

  // Final verification: required files must exist and look valid.
  const requiredPaths = requiredFileList()
  for (const p of requiredPaths) {
    const fileName = path.basename(p)
    // eslint-disable-next-line no-await-in-loop
    const ok = await fileLooksValid(p, fileName)
    if (!ok) {
      throw new Error(`[face-models] Model file invalid or missing after download: ${p}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  // Exit non-zero if we can't ensure model files exist.
  process.exit(1)
})

