/**
 * נורמליזציה והתאמת תחום חיפוש **בלי** `node:path` — לשימוש ברנדרר בלבד (Vite).
 * מונע קריסות/התנהגות שונה מ-polyfill של path בדפדפן.
 */

export function isWindowsRuntime(): boolean {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32'
  }
  if (typeof navigator !== 'undefined') {
    const n = navigator as Navigator & { userAgentData?: { platform?: string } }
    if (n.userAgentData?.platform === 'Windows') return true
    return /windows/i.test(navigator.userAgent)
  }
  return false
}

export function sanitizePathInput(p: string): string {
  if (typeof p !== 'string') return ''
  return p
    .replace(/\uFEFF/g, '')
    .replace(/\u200B/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '')
    .replace(/[\r\n]/g, '')
    .normalize('NFC')
    .trim()
}

function normalizePosixLike(p: string): string {
  const cleaned = sanitizePathInput(p)
  if (!cleaned) return '.'
  const parts = cleaned.split(/\/+/).filter((x) => x.length > 0 && x !== '.')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (stack.length) stack.pop()
    } else {
      stack.push(part)
    }
  }
  if (cleaned.startsWith('/')) return '/' + stack.join('/')
  return stack.join('/') || '.'
}

/** מסלק `.` ו־`..` מתחת לשורש כונן `D:\...`. */
function normalizeWindowsAbsoluteWithDrive(driveLetter: string, tail: string): string {
  let t = tail.replace(/\//g, '\\')
  if (!t.startsWith('\\')) t = '\\' + t
  const raw = t.split(/\\+/).filter((x) => x.length > 0 && x !== '.')
  const stack: string[] = []
  for (const part of raw) {
    if (part === '..') {
      if (stack.length) stack.pop()
    } else {
      stack.push(part)
    }
  }
  return `${driveLetter}:\\${stack.join('\\')}`
}

/**
 * נתיב מוחלט בסגנון Node לצורך סינון חיפוש — רק מקרים נפוצים (כונן, UNC בסיסי).
 */
export function normalizePath(p: string): string {
  const cleaned = sanitizePathInput(p)
  if (!cleaned) return '.'
  if (!isWindowsRuntime()) {
    return normalizePosixLike(cleaned)
  }

  let s = cleaned.replace(/\//g, '\\')
  const driveRel = /^([A-Za-z]):([^\\/])/.exec(s)
  if (driveRel) {
    s = `${driveRel[1]}:\\${s.slice(2)}`
  }

  if (s.startsWith('\\\\?\\')) {
    if (s.startsWith('\\\\?\\UNC\\')) {
      return s
    }
    const rest = s.slice(4)
    if (/^[A-Za-z]:\\/.test(rest)) {
      const m = /^([A-Za-z]):\\(.*)$/.exec(rest)!
      return normalizeWindowsAbsoluteWithDrive(m[1], '\\' + m[2])
    }
    return s
  }

  if (s.startsWith('\\\\')) {
    const uncParts = s.split(/\\+/).filter(Boolean)
    if (uncParts.length >= 2) {
      const host = uncParts[0]
      const share = uncParts[1]
      const rest = uncParts.slice(2)
      const tail = rest.length ? '\\' + rest.join('\\') : ''
      return `\\\\${host}\\${share}${tail}`.replace(/\\+$/, '')
    }
    return s
  }

  const m = /^([A-Za-z]):(\\.*)?$/.exec(s)
  if (m) {
    const letter = m[1]
    const tail = m[2] ?? '\\'
    return normalizeWindowsAbsoluteWithDrive(letter, tail)
  }

  return s
}

export function normalizeSearchScopePath(scopePath: string): string {
  let base = normalizePath(scopePath).replace(/[/\\]+$/, '')
  if (isWindowsRuntime() && /^[A-Za-z]:$/.test(base)) {
    base += '\\'
  }
  return base
}

export function pathDrivelessKeyNormalized(normalizedAbsPath: string): string | null {
  if (!isWindowsRuntime()) return null
  let p = normalizedAbsPath.replace(/\//g, '\\')
  if (p.startsWith('\\\\?\\UNC\\')) return null
  if (p.startsWith('\\\\?\\')) {
    const rest = p.slice(4)
    if (/^[A-Za-z]:\\/.test(rest)) p = rest
    else return null
  }
  if (p.startsWith('\\\\')) return null
  const m = /^([A-Za-z]):\\(.*)$/.exec(p)
  if (!m) return null
  const tail = m[2]
  const unified = tail.replace(/\//g, '\\').toLowerCase()
  return '\\' + unified
}

export function pathDrivelessKey(absolutePath: string): string | null {
  return pathDrivelessKeyNormalized(normalizePath(absolutePath))
}

export function drivelessItemUnderScope(itemDriveless: string, scopeDriveless: string): boolean {
  if (scopeDriveless === '\\') {
    return itemDriveless !== '\\' && itemDriveless.startsWith('\\')
  }
  return itemDriveless === scopeDriveless || itemDriveless.startsWith(scopeDriveless + '\\')
}

/** join בסיסי כמו path.join לכונן (תחום + זנב). */
function win32Join(scopeNorm: string, tailParts: string[]): string {
  if (tailParts.length === 0) return scopeNorm
  const extra = tailParts.join('\\')
  if (scopeNorm.endsWith('\\')) return `${scopeNorm}${extra}`
  return `${scopeNorm}\\${extra}`
}

export function resolvePathForSearchScope(
  scopePath: string,
  storedAbsolutePath: string,
  itemDriveless: string | null
): string {
  const scopeNorm = normalizeSearchScopePath(scopePath)
  const sk = pathDrivelessKeyNormalized(scopeNorm)
  if (!itemDriveless || !sk) return storedAbsolutePath
  if (!drivelessItemUnderScope(itemDriveless, sk)) return storedAbsolutePath
  if (itemDriveless === sk) return scopeNorm
  const prefix = sk === '\\' ? '\\' : sk + '\\'
  const tail =
    sk === '\\'
      ? itemDriveless.replace(/^\\/, '')
      : itemDriveless.startsWith(prefix)
        ? itemDriveless.slice(prefix.length)
        : null
  if (tail === null) return storedAbsolutePath
  const parts = tail.split(/\\+/).filter(Boolean)
  if (parts.length === 0) return scopeNorm
  const joined = win32Join(scopeNorm, parts)
  return normalizePath(joined)
}
