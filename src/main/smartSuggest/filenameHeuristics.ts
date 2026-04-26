import path from 'node:path'

export interface FilenameSignal {
  tag: string
  score: number
  reason: string
}

const LOCATION_HINTS: Record<string, string> = {
  jerusalem: 'Jerusalem',
  yerushalayim: 'Jerusalem',
  tlv: 'Tel Aviv',
  telaviv: 'Tel Aviv',
  haifa: 'Haifa',
  tiberias: 'Tiberias',
  eilat: 'Eilat'
}

const KEYWORD_HINTS: Record<string, string> = {
  wedding: 'Wedding',
  bar: 'Bar Mitzvah',
  bat: 'Bat Mitzvah',
  mitzvah: 'Bar Mitzvah',
  hanukkah: 'Hanukkah',
  purim: 'Purim',
  trip: 'Trip',
  vacation: 'Vacation',
  beach: 'Beach',
  forest: 'Forest',
  kids: 'Kids',
  family: 'Family'
}

function tokenize(raw: string): string[] {
  const s = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  return s
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function analyzeFilenameHeuristics(filePath: string): FilenameSignal[] {
  const base = path.basename(filePath, path.extname(filePath))
  const tokens = tokenize(base).map((t) => t.toLowerCase())

  const out: FilenameSignal[] = []

  for (const tok of tokens) {
    const loc = LOCATION_HINTS[tok]
    if (loc) out.push({ tag: loc, score: 0.55, reason: `filename:${tok}` })
    const kw = KEYWORD_HINTS[tok]
    if (kw) out.push({ tag: kw, score: 0.5, reason: `filename:${tok}` })
  }

  // Year tag
  const yearTok = tokens.find((t) => /^\d{4}$/.test(t))
  if (yearTok) out.push({ tag: yearTok, score: 0.35, reason: 'filename:year' })

  return out
}

