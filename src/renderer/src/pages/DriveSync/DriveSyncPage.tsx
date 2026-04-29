import { useCallback, useMemo, useState } from 'react'
import type { CopyJob, ScanMode } from '../../../../shared/driveSyncTypes'
import { ConflictModal } from './ConflictModal'
import { FolderSelector } from './TopPanel/FolderSelector'
import { ScanModeRadio } from './TopPanel/ScanModeRadio'
import { ScanProgressBar } from './TopPanel/ScanProgressBar'
import { DiffColumn } from './DiffView/DiffColumn'
import { DiffFilters } from './DiffView/DiffFilters'
import { DiffSummary } from './DiffView/DiffSummary'
import { useDriveSyncCopy } from './hooks/useDriveSyncCopy'
import { useDriveSyncScan } from './hooks/useDriveSyncScan'
import type { DiffShowFilter } from './DiffView/filterTypes'
import type { DiffRowEntry } from './DiffView/DiffRow'
import { formatBytes } from './DiffView/formatBytes'

/** Apply the show + search filters to a column list. Pure for memoizability. */
function filterEntries(
  entries: DiffRowEntry[],
  show: DiffShowFilter,
  search: string
): DiffRowEntry[] {
  const term = search.trim().toLowerCase()
  if (show === 'both' && !term) return entries
  return entries.filter((e) => {
    if (show === 'files' && !e.isFile) return false
    if (show === 'folders' && e.isFile) return false
    if (term && !e.relativePath.toLowerCase().includes(term)) return false
    return true
  })
}

/** Build a list of CopyJobs from the three selection sets. */
function buildCopyJobs(
  selectedA: Set<string>,
  selectedB: Set<string>,
  selectedDiffer: Set<string>,
  byPathA: Map<string, DiffRowEntry>,
  byPathB: Map<string, DiffRowEntry>,
  byPathDiffer: Map<string, { aIsFile: boolean }>
): CopyJob[] {
  const jobs: CopyJob[] = []
  for (const rel of selectedA) {
    const e = byPathA.get(rel)
    jobs.push({ from: 'A', relativePath: rel, isDirectory: e ? !e.isFile : false })
  }
  for (const rel of selectedB) {
    const e = byPathB.get(rel)
    jobs.push({ from: 'B', relativePath: rel, isDirectory: e ? !e.isFile : false })
  }
  // For "differ", default to copying from A→B. The user can flip the choice in a future iteration.
  for (const rel of selectedDiffer) {
    const isDir = !(byPathDiffer.get(rel)?.aIsFile ?? true)
    jobs.push({ from: 'A', relativePath: rel, isDirectory: isDir })
  }
  return jobs
}

/** Top-level page wiring all drive-sync components together. */
export function DriveSyncPage(): JSX.Element {
  const [rootA, setRootA] = useState('')
  const [rootB, setRootB] = useState('')
  const [mode, setMode] = useState<ScanMode>('fast')
  const [show, setShow] = useState<DiffShowFilter>('both')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedA, setSelectedA] = useState<Set<string>>(new Set())
  const [selectedB, setSelectedB] = useState<Set<string>>(new Set())
  const [selectedDiffer, setSelectedDiffer] = useState<Set<string>>(new Set())
  /** Side which differ rows should be copied from. A→B by default. */
  const [differSide, setDifferSide] = useState<'A' | 'B'>('A')
  const [showCopyErrors, setShowCopyErrors] = useState(false)

  const scan = useDriveSyncScan()
  const copy = useDriveSyncCopy()

  const onlyA = useMemo<DiffRowEntry[]>(
    () =>
      scan.state.result?.onlyInA.map((e) => ({
        relativePath: e.relativePath,
        size: e.size,
        isFile: e.isFile
      })) ?? [],
    [scan.state.result]
  )
  const onlyB = useMemo<DiffRowEntry[]>(
    () =>
      scan.state.result?.onlyInB.map((e) => ({
        relativePath: e.relativePath,
        size: e.size,
        isFile: e.isFile
      })) ?? [],
    [scan.state.result]
  )
  const differ = useMemo<DiffRowEntry[]>(
    () =>
      scan.state.result?.differ.map((d) => ({
        relativePath: d.relativePath,
        size: d.a.size,
        isFile: d.a.isFile
      })) ?? [],
    [scan.state.result]
  )

  const filteredA = useMemo(() => filterEntries(onlyA, show, searchTerm), [onlyA, show, searchTerm])
  const filteredB = useMemo(() => filterEntries(onlyB, show, searchTerm), [onlyB, show, searchTerm])
  const filteredDiffer = useMemo(
    () => filterEntries(differ, show, searchTerm),
    [differ, show, searchTerm]
  )

  const byPathA = useMemo(() => new Map(onlyA.map((e) => [e.relativePath, e])), [onlyA])
  const byPathB = useMemo(() => new Map(onlyB.map((e) => [e.relativePath, e])), [onlyB])
  const byPathDiffer = useMemo(() => {
    const map = new Map<string, { aIsFile: boolean; aSize: number; bSize: number }>()
    for (const d of scan.state.result?.differ ?? []) {
      map.set(d.relativePath, { aIsFile: d.a.isFile, aSize: d.a.size, bSize: d.b.size })
    }
    return map
  }, [scan.state.result])

  const differSecondary = useCallback(
    (entry: DiffRowEntry): string | undefined => {
      const d = byPathDiffer.get(entry.relativePath)
      if (!d) return undefined
      return `${formatBytes(d.aSize)} ↔ ${formatBytes(d.bSize)}`
    },
    [byPathDiffer]
  )

  const totalSelected = selectedA.size + selectedB.size + selectedDiffer.size

  const clearSelections = useCallback(() => {
    setSelectedA(new Set())
    setSelectedB(new Set())
    setSelectedDiffer(new Set())
  }, [])

  const onScan = useCallback(async () => {
    clearSelections()
    setShowCopyErrors(false)
    copy.clearSummary()
    await scan.start(rootA, rootB, mode)
  }, [clearSelections, copy, mode, rootA, rootB, scan])

  const onCopy = useCallback(async () => {
    if (totalSelected === 0) return
    // For differ, the user picks A→B or B→A. We translate the selection accordingly.
    const baseJobs = buildCopyJobs(selectedA, selectedB, selectedDiffer, byPathA, byPathB, byPathDiffer)
    const jobs = baseJobs.map((j) => {
      const isDifferRow = selectedDiffer.has(j.relativePath)
      if (!isDifferRow) return j
      return { ...j, from: differSide }
    })
    setShowCopyErrors(false)
    await copy.start(rootA, rootB, jobs)
  }, [
    byPathA,
    byPathB,
    byPathDiffer,
    copy,
    differSide,
    rootA,
    rootB,
    selectedA,
    selectedB,
    selectedDiffer,
    totalSelected
  ])

  const swap = useCallback(() => {
    setRootA(rootB)
    setRootB(rootA)
  }, [rootA, rootB])

  const onReset = useCallback(() => {
    clearSelections()
    setRootA('')
    setRootB('')
    setSearchTerm('')
    setShow('both')
    setDifferSide('A')
    setShowCopyErrors(false)
    copy.clearSummary()
    scan.reset()
  }, [clearSelections, copy, scan])

  const hasResult = scan.state.result != null
  const canScan = !scan.state.busy && rootA.trim() !== '' && rootB.trim() !== ''
  const errorEntries = useMemo(
    () => copy.state.log.filter((e) => e.result === 'error'),
    [copy.state.log]
  )

  return (
    <section className="panel drive-sync-page">
      <h2>השוואת כוננים</h2>
      <p className="drive-sync-intro">
        בחר שתי תיקיות והשווה ביניהן: מה יש בא' ולא בב', מה בב' ולא בא', ומה שונה בשניהם. אפשר
        לסמן פריטים ולהעתיק בין הצדדים.
      </p>

      <div className="drive-sync-card">
        <FolderSelector
          rootA={rootA}
          rootB={rootB}
          setRootA={setRootA}
          setRootB={setRootB}
          onSwap={swap}
          disabled={scan.state.busy}
        />

        <div className="drive-sync-toolbar">
          <ScanModeRadio mode={mode} setMode={setMode} disabled={scan.state.busy} />
          <div className="drive-sync-toolbar-spacer" />
          <button
            type="button"
            className="drive-sync-action-btn"
            onClick={onReset}
            disabled={scan.state.busy || (!hasResult && !rootA && !rootB && totalSelected === 0)}
            title="נקה את הטופס וההשוואה הנוכחית"
          >
            איפוס
          </button>
          <button
            type="button"
            className="drive-sync-action-btn primary"
            onClick={onScan}
            disabled={!canScan}
          >
            {scan.state.busy ? 'בודק…' : hasResult ? 'בדוק שוב' : 'בדוק'}
          </button>
        </div>

        {scan.state.error ? (
          <div className="drive-sync-error-banner" role="alert">
            ⚠ {scan.state.error}
          </div>
        ) : null}

        {scan.state.busy ? (
          <ScanProgressBar
            progress={scan.state.progress}
            countsA={scan.state.counts?.scannedA}
            countsB={scan.state.counts?.scannedB}
            onCancel={() => void scan.cancel()}
          />
        ) : null}
      </div>

      {hasResult ? (
        <>
          <DiffSummary
            onlyA={onlyA.length}
            onlyB={onlyB.length}
            differ={differ.length}
            scannedA={scan.state.counts?.scannedA}
            scannedB={scan.state.counts?.scannedB}
            elapsedMs={scan.state.elapsedMs}
          />
          <DiffFilters
            show={show}
            setShow={setShow}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />

          <div className="drive-sync-grid">
            <DiffColumn
              variant="only-a"
              title="רק בא'"
              entries={filteredA}
              totalCount={onlyA.length}
              selected={selectedA}
              setSelected={setSelectedA}
              scrollId="onlyA"
            />
            <DiffColumn
              variant="differ"
              title="שונים בשניהם"
              entries={filteredDiffer}
              totalCount={differ.length}
              selected={selectedDiffer}
              setSelected={setSelectedDiffer}
              secondaryFor={differSecondary}
              scrollId="differ"
            />
            <DiffColumn
              variant="only-b"
              title="רק בב'"
              entries={filteredB}
              totalCount={onlyB.length}
              selected={selectedB}
              setSelected={setSelectedB}
              scrollId="onlyB"
            />
          </div>

          {differ.length > 0 ? (
            <div className="drive-sync-differ-direction">
              עבור פריטים בעמודה "שונים", העתק מ:
              <label>
                <input
                  type="radio"
                  checked={differSide === 'A'}
                  onChange={() => setDifferSide('A')}
                />{' '}
                א' → ב'
              </label>
              <label>
                <input
                  type="radio"
                  checked={differSide === 'B'}
                  onChange={() => setDifferSide('B')}
                />{' '}
                ב' → א'
              </label>
            </div>
          ) : null}

          <div className="drive-sync-copy-controls">
            <button
              type="button"
              className="drive-sync-action-btn primary"
              onClick={onCopy}
              disabled={totalSelected === 0 || copy.state.busy}
            >
              {copy.state.busy ? 'מעתיק…' : `העתק נבחרים (${totalSelected})`}
            </button>
            {totalSelected > 0 && !copy.state.busy ? (
              <button
                type="button"
                className="drive-sync-action-btn"
                onClick={clearSelections}
              >
                נקה בחירה
              </button>
            ) : null}
            {copy.state.busy ? (
              <button
                type="button"
                className="drive-sync-action-btn danger"
                onClick={() => void copy.cancel()}
              >
                ביטול
              </button>
            ) : null}
            {copy.state.busy ? (
              <div className="drive-sync-copy-status" aria-live="polite">
                <div className="drive-sync-copy-status-row">
                  <span>
                    מעתיק {copy.state.index + 1}/{copy.state.total}
                  </span>
                  {copy.state.bytesTotal > 0 ? (
                    <span className="drive-sync-copy-status-bytes">
                      {formatBytes(copy.state.bytesDone)} / {formatBytes(copy.state.bytesTotal)}
                    </span>
                  ) : null}
                </div>
                {copy.state.currentPath ? (
                  <span className="drive-sync-copy-status-path" dir="ltr">
                    {copy.state.currentPath}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {copy.state.summary ? (
            <div
              className={
                copy.state.summary.failed > 0 || copy.state.summary.error
                  ? 'drive-sync-copy-summary has-error'
                  : 'drive-sync-copy-summary'
              }
            >
              <div className="drive-sync-copy-summary-row">
                <span className="drive-sync-summary-pill success">
                  הועתקו: <b>{copy.state.summary.copied}</b>
                </span>
                <span className="drive-sync-summary-pill warn">
                  דולגו: <b>{copy.state.summary.skipped}</b>
                </span>
                <span className="drive-sync-summary-pill warn">
                  שם חדש: <b>{copy.state.summary.renamed}</b>
                </span>
                <span className="drive-sync-summary-pill danger">
                  נכשלו: <b>{copy.state.summary.failed}</b>
                </span>
                {copy.state.summary.error ? (
                  <span className="drive-sync-summary-pill danger" title={copy.state.summary.error}>
                    שגיאה: {copy.state.summary.error.slice(0, 80)}
                  </span>
                ) : null}
                <button type="button" className="drive-sync-copy-summary-toggle" onClick={copy.clearSummary}>
                  נקה
                </button>
              </div>
              {errorEntries.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="drive-sync-copy-summary-toggle"
                    onClick={() => setShowCopyErrors((v) => !v)}
                  >
                    {showCopyErrors
                      ? 'הסתר רשימת שגיאות'
                      : `הצג ${errorEntries.length} שגיאות`}
                  </button>
                  {showCopyErrors ? (
                    <ul className="drive-sync-error-list">
                      {errorEntries.map((e, idx) => (
                        <li key={`${idx}-${e.relativePath}`}>
                          <span className="drive-sync-error-path" dir="ltr">
                            {e.relativePath}
                          </span>
                          <span className="drive-sync-error-message">
                            {e.error ?? 'נכשל ללא פירוט'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {copy.state.conflict ? (
        <ConflictModal
          prompt={copy.state.conflict}
          onResolve={(response) => copy.respondToConflict(copy.state.conflict!.token, response)}
        />
      ) : null}
    </section>
  )
}
