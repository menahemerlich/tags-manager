import { promises as fs } from 'node:fs'
import path from 'node:path'

const destDir = path.resolve('resources/models/face')

const files = [
  {
    name: 'scrfd.onnx',
    url: 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/det_10g.onnx?download=true',
    minBytes: 5_000_000
  },
  {
    name: 'arcface.onnx',
    url: 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx?download=true',
    minBytes: 50_000_000
  }
]

async function fileLooksValid(filePath, minBytes) {
  try {
    const stat = await fs.stat(filePath)
    return stat.size >= minBytes
  } catch {
    return false
  }
}

async function downloadOne(url, outPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`)
  const ab = await res.arrayBuffer()
  await fs.writeFile(outPath, Buffer.from(ab))
}

async function main() {
  await fs.mkdir(destDir, { recursive: true })
  for (const file of files) {
    const out = path.join(destDir, file.name)
    // eslint-disable-next-line no-await-in-loop
    const valid = await fileLooksValid(out, file.minBytes)
    if (valid) {
      console.log(`[onnx-face-models] ${file.name} already exists, skip`)
      continue
    }
    console.log(`[onnx-face-models] downloading ${file.name}...`)
    // eslint-disable-next-line no-await-in-loop
    try {
      // eslint-disable-next-line no-await-in-loop
      await downloadOne(file.url, out)
    } catch (err) {
      console.warn(`[onnx-face-models] warning: failed downloading ${file.name}: ${String(err)}`)
      console.warn('[onnx-face-models] continuing without ONNX models (app can still use fallback engine)')
      return
    }
    // eslint-disable-next-line no-await-in-loop
    const ok = await fileLooksValid(out, file.minBytes)
    if (!ok) {
      console.warn(`[onnx-face-models] warning: downloaded file invalid: ${file.name}`)
      console.warn('[onnx-face-models] continuing without ONNX models (app can still use fallback engine)')
      return
    }
  }
  console.log('[onnx-face-models] done')
}

main().catch((err) => {
  console.warn(`[onnx-face-models] warning: ${String(err)}`)
  console.warn('[onnx-face-models] continuing without ONNX models')
})

