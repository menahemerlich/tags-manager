import SyncPage from '../pages/Sync/SyncPage'
import { FaceRecognitionTab } from '../face/FaceRecognitionTab'
import { WatermarkEditorTab } from '../watermark/WatermarkEditorTab'
import type { Tab, FaceTab } from './appTabs'
import { LibraryTabPanel, type LibraryTabPanelProps } from './panels/LibraryTabPanel'
import { SearchTabPanel, type SearchTabPanelProps } from './panels/SearchTabPanel'
import { TagsTabPanel, type TagsTabPanelProps } from './panels/TagsTabPanel'
import { SettingsTabPanel, type SettingsTabPanelProps } from './panels/SettingsTabPanel'

export type AppMainPanelsProps = {
  tab: Tab | FaceTab
  error: string | null
  library: LibraryTabPanelProps
  search: SearchTabPanelProps
  tags: TagsTabPanelProps
  settings: SettingsTabPanelProps
  refreshSearchTagData: () => void | Promise<void>
  faceOpenFromPreview: { path: string; id: number } | null
  onFaceOpenFromPreviewHandled: (id: number) => void
  watermarkOpenFromPreview: { path: string; id: number } | null
  onWatermarkOpenFromPreviewHandled: (id: number) => void
}

/** תוכן ה־main: טאבים לפי מצב הניווט. */
export function AppMainPanels({
  tab,
  error,
  library,
  search,
  tags,
  settings,
  refreshSearchTagData,
  faceOpenFromPreview,
  onFaceOpenFromPreviewHandled,
  watermarkOpenFromPreview,
  onWatermarkOpenFromPreviewHandled
}: AppMainPanelsProps) {
  return (
    <main className="main">
      {error && (
        <p className="muted" style={{ color: 'var(--danger)', marginTop: 0 }}>
          {error}
        </p>
      )}

      {tab === 'library' && <LibraryTabPanel {...library} />}

      {tab === 'search' && <SearchTabPanel {...search} />}

      {tab === 'tags' && <TagsTabPanel {...tags} />}

      {tab === 'faces' && (
        <section className="panel">
          <FaceRecognitionTab
            onTagsChanged={refreshSearchTagData}
            openFromPreview={faceOpenFromPreview}
            onOpenFromPreviewHandled={onFaceOpenFromPreviewHandled}
          />
        </section>
      )}

      {tab === 'watermark' && (
        <section className="panel">
          <WatermarkEditorTab
            openFromPreview={watermarkOpenFromPreview}
            onOpenFromPreviewHandled={onWatermarkOpenFromPreviewHandled}
          />
        </section>
      )}

      {tab === 'cloud-sync' && <SyncPage />}

      {tab === 'settings' && <SettingsTabPanel {...settings} />}
    </main>
  )
}
