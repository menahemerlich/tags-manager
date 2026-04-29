/**
 * Tiny byte formatter used in diff rows. Avoids pulling another dependency for a single use.
 * Returns a Hebrew-localized number with a unit suffix.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  const fixed = value < 10 && i > 0 ? value.toFixed(1) : Math.round(value).toString()
  return `${fixed} ${units[i]}`
}
