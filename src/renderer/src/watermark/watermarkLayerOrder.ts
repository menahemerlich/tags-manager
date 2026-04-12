/** סדר ערימה משותף לטקסט ולצורות (אינדקס 0 = תחתית, האחרון = למעלה). */
export type WatermarkLayerEntry = { kind: 'text' | 'shape'; id: string }

export function moveLayerForward(
  order: WatermarkLayerEntry[],
  kind: 'text' | 'shape',
  id: string
): WatermarkLayerEntry[] {
  const i = order.findIndex((e) => e.kind === kind && e.id === id)
  if (i < 0 || i >= order.length - 1) return order
  const next = [...order]
  ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
  return next
}

export function moveLayerBackward(
  order: WatermarkLayerEntry[],
  kind: 'text' | 'shape',
  id: string
): WatermarkLayerEntry[] {
  const i = order.findIndex((e) => e.kind === kind && e.id === id)
  if (i <= 0) return order
  const next = [...order]
  ;[next[i], next[i - 1]] = [next[i - 1], next[i]]
  return next
}

export function layerIndexInStack(order: WatermarkLayerEntry[], kind: 'text' | 'shape', id: string): number {
  return order.findIndex((e) => e.kind === kind && e.id === id)
}

/** מסנכרן רשימה קיימת עם מזהים חדשים/נמחקים — שומר סדר יחסי. */
export function mergeLayerEntries(
  order: WatermarkLayerEntry[],
  shapeItems: { id: string }[],
  textItems: { id: string }[]
): WatermarkLayerEntry[] {
  const shapeIds = new Set(shapeItems.map((s) => s.id))
  const textIds = new Set(textItems.map((t) => t.id))
  const filtered = order.filter(
    (e) => (e.kind === 'shape' && shapeIds.has(e.id)) || (e.kind === 'text' && textIds.has(e.id))
  )
  const keys = new Set(filtered.map((e) => `${e.kind}:${e.id}`))
  const additions: WatermarkLayerEntry[] = []
  for (const s of shapeItems) {
    if (!keys.has(`shape:${s.id}`)) additions.push({ kind: 'shape', id: s.id })
  }
  for (const t of textItems) {
    if (!keys.has(`text:${t.id}`)) additions.push({ kind: 'text', id: t.id })
  }
  return [...filtered, ...additions]
}
