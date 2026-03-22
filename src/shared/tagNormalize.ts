/** Trim and collapse internal whitespace for display; keep user-visible name. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function isValidTagName(name: string): boolean {
  return normalizeTagName(name).length > 0
}
