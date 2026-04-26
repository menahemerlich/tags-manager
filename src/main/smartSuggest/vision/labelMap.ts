export interface VisionLabelHit {
  label: string
  score: number
}

/**
 * Minimal label-to-tag mapping.
 * We keep it small and opinionated; the model can be swapped without changing UI contracts.
 */
export function mapLabelsToSuggestedTags(hits: VisionLabelHit[]): { tag: string; score: number; reason: string }[] {
  const out: { tag: string; score: number; reason: string }[] = []
  for (const h of hits) {
    const l = h.label.toLowerCase()
    if (l.includes('beach') || l.includes('seashore') || l.includes('coast')) {
      out.push({ tag: 'Beach', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('forest') || l.includes('woodland') || l.includes('tree')) {
      out.push({ tag: 'Forest', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('mountain')) {
      out.push({ tag: 'Mountains', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('food') || l.includes('restaurant') || l.includes('dish')) {
      out.push({ tag: 'Food', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('wedding')) {
      out.push({ tag: 'Wedding', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('child') || l.includes('kid') || l.includes('baby')) {
      out.push({ tag: 'Kids', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('document') || l.includes('paper')) {
      out.push({ tag: 'Document', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('outdoor') || l.includes('park')) {
      out.push({ tag: 'Outdoors', score: h.score, reason: `vision:${h.label}` })
    } else if (l.includes('indoor') || l.includes('room')) {
      out.push({ tag: 'Indoors', score: h.score, reason: `vision:${h.label}` })
    }
  }
  return out
}

