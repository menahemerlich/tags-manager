import { useCallback, useRef } from 'react'

/**
 * Shift+Click range selection over a stable list of items. Tracks the last "anchor" index
 * so a normal click sets the anchor, and Shift+Click selects every key between the anchor
 * and the clicked index inclusive.
 *
 * Selections are represented as a `Set<string>` keyed by an opaque string per item. The hook
 * does not know about your model — it just produces a new Set you can apply to your state.
 */
export interface ShiftToggleOptions {
  /** Whether the click should select (true) or deselect (false). For Shift-range we apply this to all keys in range. */
  selecting?: boolean
}

export function useShiftSelection(): {
  toggle: (
    keys: string[],
    selected: Set<string>,
    clickedIndex: number,
    shift: boolean,
    opts?: ShiftToggleOptions
  ) => Set<string>
  resetAnchor: () => void
} {
  const anchorRef = useRef<number | null>(null)

  const toggle = useCallback(
    (
      keys: string[],
      selected: Set<string>,
      clickedIndex: number,
      shift: boolean,
      opts?: ShiftToggleOptions
    ): Set<string> => {
      if (clickedIndex < 0 || clickedIndex >= keys.length) return selected
      const key = keys[clickedIndex]
      const next = new Set(selected)
      if (shift && anchorRef.current != null) {
        const lo = Math.min(anchorRef.current, clickedIndex)
        const hi = Math.max(anchorRef.current, clickedIndex)
        const select = opts?.selecting ?? !selected.has(key)
        for (let i = lo; i <= hi; i += 1) {
          const k = keys[i]
          if (select) next.add(k)
          else next.delete(k)
        }
      } else {
        if (next.has(key)) next.delete(key)
        else next.add(key)
        anchorRef.current = clickedIndex
      }
      return next
    },
    []
  )

  const resetAnchor = useCallback(() => {
    anchorRef.current = null
  }, [])

  return { toggle, resetAnchor }
}
