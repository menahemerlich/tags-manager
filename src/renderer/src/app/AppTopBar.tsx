import type { Tab, FaceTab } from './appTabs'

type Props = {
  appVersion: string
  tab: Tab | FaceTab
  setTab: (t: Tab | FaceTab) => void
}

const NAV: ReadonlyArray<readonly [Tab | FaceTab, string]> = [
  ['library', 'ספרייה'],
  ['search', 'חיפוש'],
  ['tags', 'תגיות'],
  ['faces', 'זיהוי פנים'],
  ['watermark', 'סימן מים'],
  ['cloud-sync', 'סנכרון ענן'],
  ['drive-sync', 'השוואת כוננים'],
  ['settings', 'הגדרות']
]

/** סרגל עליון: כותרת, ניווט בין טאבים, מספר גרסה */
export function AppTopBar({ appVersion, tab, setTab }: Props) {
  return (
    <header className="topbar">
      <h1>ניהול ארכיון</h1>
      <nav className="nav">
        {NAV.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <span className="muted small" style={{ marginInlineStart: 'auto' }}>
        גרסה {appVersion}
      </span>
    </header>
  )
}
