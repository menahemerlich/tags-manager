import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CopyConflictPrompt,
  CopyJob,
  CopyStage,
  DriveSyncCopyDone,
  ConflictResponse
} from '../../../../../shared/driveSyncTypes'

export interface DriveSyncCopyState {
  busy: boolean
  /** Current 0-based index in the queue. */
  index: number
  /** Total jobs. */
  total: number
  /** Current item path. */
  currentPath: string
  /** Bytes for the current file. */
  bytesDone: number
  bytesTotal: number
  /** Pending conflict prompt awaiting renderer response. */
  conflict: CopyConflictPrompt | null
  /** Final summary, only present once the whole queue completes. */
  summary: DriveSyncCopyDone | null
  /** Last per-item result message, e.g. "skipped", "renamed". */
  log: { relativePath: string; result: 'copied' | 'skipped' | 'renamed' | 'error'; error?: string }[]
}

const initialState: DriveSyncCopyState = {
  busy: false,
  index: 0,
  total: 0,
  currentPath: '',
  bytesDone: 0,
  bytesTotal: 0,
  conflict: null,
  summary: null,
  log: []
}

/**
 * Hook that drives the copy queue: sends jobs to main, listens for per-file progress, and
 * routes conflict prompts up to a UI modal via `state.conflict`. The component is responsible
 * for showing a modal and calling `respondToConflict` with the user's decision.
 */
export function useDriveSyncCopy(): {
  state: DriveSyncCopyState
  start: (rootA: string, rootB: string, jobs: CopyJob[]) => Promise<void>
  cancel: () => Promise<void>
  respondToConflict: (token: string, response: ConflictResponse) => void
  clearSummary: () => void
} {
  const [state, setState] = useState<DriveSyncCopyState>(initialState)
  const tokenRef = useRef(0)

  useEffect(() => {
    const offProg = window.api.onDriveSyncCopyProgress((stage: CopyStage) => {
      setState((prev) => {
        if (!prev.busy) return prev
        switch (stage.type) {
          case 'start':
            return { ...prev, total: stage.total, index: 0, log: [] }
          case 'file':
            return {
              ...prev,
              index: stage.index,
              total: stage.total,
              currentPath: stage.relativePath,
              bytesDone: 0,
              bytesTotal: 0
            }
          case 'progress':
            return { ...prev, bytesDone: stage.bytesDone, bytesTotal: stage.bytesTotal }
          case 'item-done':
            return {
              ...prev,
              log: [
                ...prev.log,
                {
                  relativePath: stage.relativePath,
                  result: stage.result,
                  error: stage.error
                }
              ]
            }
          default:
            return prev
        }
      })
    })
    const offDone = window.api.onDriveSyncCopyDone((summary) => {
      setState((prev) => ({ ...prev, busy: false, summary, conflict: null }))
    })
    const offConflict = window.api.onDriveSyncConflictPrompt((prompt) => {
      setState((prev) => ({ ...prev, conflict: prompt }))
    })
    return () => {
      offProg()
      offDone()
      offConflict()
    }
  }, [])

  const start = useCallback(async (rootA: string, rootB: string, jobs: CopyJob[]) => {
    if (jobs.length === 0) return
    tokenRef.current += 1
    setState({
      busy: true,
      index: 0,
      total: jobs.length,
      currentPath: '',
      bytesDone: 0,
      bytesTotal: 0,
      conflict: null,
      summary: null,
      log: []
    })
    try {
      await window.api.driveSyncCopy({ rootA, rootB, jobs })
    } catch (e) {
      setState((prev) => ({
        ...prev,
        busy: false,
        summary: {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          copied: 0,
          skipped: 0,
          renamed: 0,
          failed: 0,
          elapsedMs: 0
        }
      }))
    }
  }, [])

  const cancel = useCallback(async () => {
    try {
      await window.api.driveSyncCopyCancel()
    } catch {
      // ignore
    }
    setState((prev) => ({ ...prev, busy: false, conflict: null }))
  }, [])

  const respondToConflict = useCallback((token: string, response: ConflictResponse) => {
    setState((prev) => (prev.conflict?.token === token ? { ...prev, conflict: null } : prev))
    void window.api.respondDriveSyncConflict(token, response)
  }, [])

  const clearSummary = useCallback(() => {
    setState((prev) => ({ ...prev, summary: null }))
  }, [])

  return { state, start, cancel, respondToConflict, clearSummary }
}
