import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DiffBuckets,
  DriveSyncScanDone,
  ScanMode,
  ScanProgress
} from '../../../../../shared/driveSyncTypes'

export interface DriveSyncScanState {
  busy: boolean
  progress: ScanProgress | null
  result: DiffBuckets | null
  counts: { scannedA: number; scannedB: number } | null
  error: string | null
  elapsedMs: number | null
}

const initialState: DriveSyncScanState = {
  busy: false,
  progress: null,
  result: null,
  counts: null,
  error: null,
  elapsedMs: null
}

/**
 * Hook that owns the lifecycle of a drive-sync scan: starts the IPC, listens for live progress
 * events, and exposes the final diff result. Implements a request-token pattern so a stale
 * scan response from a previous start cannot stomp on a fresh one.
 */
export function useDriveSyncScan(): {
  state: DriveSyncScanState
  start: (rootA: string, rootB: string, mode: ScanMode) => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
} {
  const [state, setState] = useState<DriveSyncScanState>(initialState)
  const tokenRef = useRef(0)

  useEffect(() => {
    const off = window.api.onDriveSyncScanProgress((p) => {
      setState((prev) => (prev.busy ? { ...prev, progress: p } : prev))
    })
    return off
  }, [])

  const start = useCallback(async (rootA: string, rootB: string, mode: ScanMode) => {
    const myToken = ++tokenRef.current
    setState({
      busy: true,
      progress: null,
      result: null,
      counts: null,
      error: null,
      elapsedMs: null
    })
    let res: DriveSyncScanDone
    try {
      res = await window.api.driveSyncStart({ rootA, rootB, mode })
    } catch (e) {
      if (myToken !== tokenRef.current) return
      setState({
        busy: false,
        progress: null,
        result: null,
        counts: null,
        error: e instanceof Error ? e.message : String(e),
        elapsedMs: null
      })
      return
    }
    if (myToken !== tokenRef.current) return
    if (res.ok && res.result) {
      setState({
        busy: false,
        progress: null,
        result: res.result,
        counts: res.counts ?? null,
        error: null,
        elapsedMs: res.elapsedMs
      })
    } else {
      const cancelled = res.error === 'cancelled'
      setState({
        busy: false,
        progress: null,
        result: null,
        counts: null,
        error: cancelled ? null : res.error ?? 'unknown error',
        elapsedMs: res.elapsedMs
      })
    }
  }, [])

  const cancel = useCallback(async () => {
    tokenRef.current += 1
    setState((prev) => ({ ...prev, busy: false, progress: null }))
    try {
      await window.api.driveSyncCancel()
    } catch {
      // best-effort
    }
  }, [])

  const reset = useCallback(() => {
    tokenRef.current += 1
    setState(initialState)
  }, [])

  return { state, start, cancel, reset }
}
