import { useMemo, useState } from 'react'
import {
  APP_HELP_PAGE_CONTENT,
  APP_HELP_PAGE_LABEL,
  APP_HELP_PAGE_ORDER,
  type AppHelpPageId
} from './appPagesHelp'

/** מסך “הסבר על האפליקציה” עם תפריט המבורגר לכל הדפים. */
export function AboutAppHelpPanel() {
  /** האם תפריט ההמבורגר פתוח. */
  const [menuOpen, setMenuOpen] = useState(false)
  /** הדף שנבחר להצגת הסבר. */
  const [selectedPageId, setSelectedPageId] = useState<AppHelpPageId>('library')

  /** תוכן ההסבר לדף הנבחר. */
  const page = useMemo(() => APP_HELP_PAGE_CONTENT[selectedPageId], [selectedPageId])

  return (
    <div className="about-help-root">
      <div className="about-help-topbar">
        <button
          type="button"
          className="btn"
          aria-expanded={menuOpen}
          aria-controls="about-help-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰ דפים
        </button>
        <div className="about-help-selected-pill" title={APP_HELP_PAGE_LABEL[selectedPageId]}>
          נבחר: <strong>{APP_HELP_PAGE_LABEL[selectedPageId]}</strong>
        </div>
      </div>

      {menuOpen && (
        <button type="button" className="about-help-backdrop" aria-label="סגור תפריט" onClick={() => setMenuOpen(false)} />
      )}

      {menuOpen && (
        <aside id="about-help-menu" className="about-help-drawer" role="dialog" aria-modal="true">
          <div className="about-help-drawer-head">
            <div className="about-help-drawer-title">בחרו דף</div>
            <button type="button" className="btn" onClick={() => setMenuOpen(false)}>
              סגור
            </button>
          </div>
          <div className="about-help-drawer-list">
            {APP_HELP_PAGE_ORDER.map((id) => {
              /** תווית לדף ברשימה. */
              const label = APP_HELP_PAGE_LABEL[id]
              return (
                <button
                  key={id}
                  type="button"
                  className={id === selectedPageId ? 'about-help-item active' : 'about-help-item'}
                  onClick={() => {
                    setSelectedPageId(id)
                    setMenuOpen(false)
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </aside>
      )}

      <article className="about-help-article">
        <h2 style={{ marginTop: 0 }}>{page.title}</h2>
        {page.paragraphs.map((p, idx) => (
          <p key={idx} className="muted small" style={{ marginTop: idx === 0 ? 0 : '0.65rem' }}>
            {p}
          </p>
        ))}
      </article>
    </div>
  )
}
