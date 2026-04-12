import type { WatermarkSelectionRect, WatermarkTextRecord, WatermarkTextStyleState } from './watermarkTypes'
import { WATERMARK_TEXT_EXPORT_MAX_LINES, WATERMARK_TEXT_LAYER_MAX_PIXELS } from './watermarkTextModel'

/** בודק אם צבע קנבס הוא שקוף (כולל rgba עם אלפא ~0). */
function isCanvasColorTransparent(c: string): boolean {
  const s = c.trim().toLowerCase()
  if (s === 'transparent') return true
  const m = /^rgba?\(\s*([^)]+)\s*\)/.exec(s)
  if (m) {
    const parts = m[1].split(',').map((x) => x.trim())
    if (parts.length === 4) {
      const a = parseFloat(parts[3])
      return Number.isFinite(a) && a < 0.001
    }
  }
  return false
}

/** שובר פסקה לשורות לפי רוחב מקסימלי במדידת canvas. */
function wrapParagraphToLines(ctx: CanvasRenderingContext2D, para: string, maxWidth: number): string[] {
  const raw = para.trim() || ' '
  const out: string[] = []
  const words = raw.trim() ? raw.trim().split(/\s+/) : ['']
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth) {
      line = test
    } else {
      if (line) {
        out.push(line)
        line = ''
      }
      if (ctx.measureText(word).width <= maxWidth) {
        line = word
      } else {
        let chunk = ''
        for (const ch of word) {
          const t2 = chunk + ch
          if (ctx.measureText(t2).width <= maxWidth) chunk = t2
          else {
            if (chunk) out.push(chunk)
            chunk = ch
          }
        }
        line = chunk
      }
    }
  }
  if (line) out.push(line)
  return out.length ? out : [' ']
}

/** שובר טקסט מלא (כולל מעברי שורה) לשורות לציור. */
function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const blocks = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    out.push(...wrapParagraphToLines(ctx, blocks[i], maxWidth))
  }
  return out.length ? out : [' ']
}

/** תיבת חיתוך צירית למלבן מקורי מסובב סביב מרכזו (בפיקסלי תמונה). */
function aabbRotatedContentRect(
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number
): WatermarkSelectionRect {
  const rad = (deg * Math.PI) / 180
  const cx = x + w / 2
  const cy = y + h / 2
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const nw = w * cos + h * sin
  const nh = w * sin + h * cos
  return {
    x: Math.round(cx - nw / 2),
    y: Math.round(cy - nh / 2),
    width: Math.max(1, Math.round(nw)),
    height: Math.max(1, Math.round(nh))
  }
}

/** מצייר את שכבת הטקסט לקנבס (תוכן בלבד, כמו בעריכה). */
export function drawWatermarkTextLayerCanvas(
  text: string,
  contentWidth: number,
  contentHeight: number,
  style: WatermarkTextStyleState
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(contentWidth))
  canvas.height = Math.max(1, Math.round(contentHeight))
  if (canvas.width * canvas.height > WATERMARK_TEXT_LAYER_MAX_PIXELS) {
    throw new Error('מסגרת הטקסט גדולה מדי לייצוא (הקטן את המסגרת או את גודל התמונה).')
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const drawableW = Math.max(1, canvas.width)
  const drawableH = Math.max(1, canvas.height)

  const fontWeight = style.bold ? '700' : '400'
  const fontStyle = style.italic ? 'italic' : 'normal'
  ctx.font = `${fontStyle} ${fontWeight} ${style.fontSizePx}px ${style.fontFamily}`
  ctx.textBaseline = 'top'
  const align = style.textAlign ?? 'right'
  ctx.textAlign = align
  ctx.direction = 'rtl'

  const lines = wrapCanvasLines(ctx, text.replace(/\r/g, ''), drawableW).slice(0, WATERMARK_TEXT_EXPORT_MAX_LINES)
  const lineHeight = style.fontSizePx * 1.35
  const x =
    align === 'left' ? 0 : align === 'center' ? drawableW / 2 : drawableW

  const fillLineBackground = (ln: string, lineTopY: number) => {
    if (isCanvasColorTransparent(style.backgroundColor)) return
    const w = Math.min(ctx.measureText(ln).width, drawableW)
    if (w <= 0) return
    let left: number
    if (align === 'left') {
      left = 0
    } else if (align === 'center') {
      left = Math.max(0, (drawableW - w) / 2)
    } else {
      left = Math.max(0, drawableW - w)
    }
    ctx.fillStyle = style.backgroundColor
    ctx.fillRect(left, lineTopY, w, lineHeight)
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, drawableW, drawableH)
  ctx.clip()
  let y = Math.max(0, (lineHeight - style.fontSizePx) / 2)
  const underlineY = (ln: string, lineTopY: number) => {
    const w = ctx.measureText(ln).width
    const uy = lineTopY + style.fontSizePx * 1.08
    let x0 = 0
    let x1 = w
    if (align === 'right') {
      x1 = drawableW
      x0 = drawableW - w
    } else if (align === 'center') {
      x0 = (drawableW - w) / 2
      x1 = x0 + w
    }
    ctx.strokeStyle = style.color
    ctx.lineWidth = Math.max(1, style.fontSizePx / 16)
    ctx.beginPath()
    ctx.moveTo(x0, uy)
    ctx.lineTo(x1, uy)
    ctx.stroke()
  }
  for (const ln of lines) {
    if (y + lineHeight > drawableH + lineHeight) break
    fillLineBackground(ln, y)
    ctx.fillStyle = style.color
    ctx.fillText(ln, x, y)
    if (style.underline) underlineY(ln, y)
    y += lineHeight
  }
  ctx.restore()
  return canvas
}

/** מחזיר Data URL של שכבת הטקסט בגודל תוכן נתון. */
export function renderWatermarkTextLayerDataUrl(
  text: string,
  contentWidth: number,
  contentHeight: number,
  style: WatermarkTextStyleState
): string {
  return drawWatermarkTextLayerCanvas(text, contentWidth, contentHeight, style).toDataURL('image/png')
}

/** מכין שכבת PNG לייצוא כולל סיבוב — מיקום וגודל לפי תיבת הכיסוי בזמן העריכה. */
export function rasterizeWatermarkTextForExport(
  item: WatermarkTextRecord,
  contentRect: WatermarkSelectionRect
): { dataUrl: string; x: number; y: number; width: number; height: number } {
  const rot = item.rotation ?? 0
  const src = drawWatermarkTextLayerCanvas(item.content, contentRect.width, contentRect.height, item.style)
  if (Math.abs(rot) < 0.01) {
    return {
      dataUrl: src.toDataURL('image/png'),
      x: contentRect.x,
      y: contentRect.y,
      width: contentRect.width,
      height: contentRect.height
    }
  }
  const rad = (rot * Math.PI) / 180
  const w = contentRect.width
  const h = contentRect.height
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const outW = Math.max(1, Math.ceil(w * cos + h * sin))
  const outH = Math.max(1, Math.ceil(w * sin + h * cos))
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')
  if (!octx) {
    return {
      dataUrl: src.toDataURL('image/png'),
      x: contentRect.x,
      y: contentRect.y,
      width: contentRect.width,
      height: contentRect.height
    }
  }
  octx.clearRect(0, 0, outW, outH)
  octx.save()
  octx.translate(outW / 2, outH / 2)
  octx.rotate(rad)
  octx.drawImage(src, -w / 2, -h / 2)
  octx.restore()
  const box = aabbRotatedContentRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height, rot)
  if (outW * outH > WATERMARK_TEXT_LAYER_MAX_PIXELS) {
    throw new Error('מסגרת הטקסט גדולה מדי לייצוא (הקטן את המסגרת או את גודל התמונה).')
  }
  return { dataUrl: out.toDataURL('image/png'), ...box }
}
