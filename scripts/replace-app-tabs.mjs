import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/renderer/src/App.tsx')
let s = fs.readFileSync(appPath, 'utf8')

const searchPanel = `{tab === 'search' && (
          <SearchTabPanel
            searchScope={searchScope}
            setSearchScope={setSearchScope}
            searchDraft={searchDraft}
            setSearchDraft={setSearchDraft}
            searchSelected={searchSelected}
            searchTruncated={searchTruncated}
            searchLoading={searchLoading}
            searchResultsFiltered={searchResultsFiltered}
            selectedSearchPath={selectedSearchPath}
            setSelectedSearchPath={setSelectedSearchPath}
            selectedSearchDirectTags={selectedSearchDirectTags}
            searchFileTagDraft={searchFileTagDraft}
            setSearchFileTagDraft={setSearchFileTagDraft}
            tags={tags}
            tagFolders={tagFolders}
            folderIdByTagId={folderIdByTagId}
            onPickSearchScope={handlePickSearchScope}
            onRefreshSearchTagData={refreshSearchTagData}
            addToSearchQuery={addToSearchQuery}
            removeSearchTag={removeSearchTag}
            toggleQuickSearchTag={toggleQuickSearchTag}
            getTagClassName={getTagClassName}
            getTagAccentStyle={getTagAccentStyle}
            formatTagLabel={formatTagLabel}
            onOpenInWatermark={openPreviewInWatermarkTab}
            onOpenInFaces={openPreviewInFacesTab}
            handleSelectSearchResult={handleSelectSearchResult}
            setSearchTagsModal={setSearchTagsModal}
            addTagToSearchFile={addTagToSearchFile}
            removeTagFromSearchFile={removeTagFromSearchFile}
          />
        )}

`

const tagsPanel = `{tab === 'tags' && (
          <TagsTabPanel
            newTagFolderName={newTagFolderName}
            setNewTagFolderName={setNewTagFolderName}
            createTagFolder={createTagFolder}
            tagFolders={tagFolders}
            tags={tags}
            expandedTagFolderIds={expandedTagFolderIds}
            setExpandedTagFolderIds={setExpandedTagFolderIds}
            folderIdByTagId={folderIdByTagId}
            renameTagFolder={renameTagFolder}
            deleteTagFolder={deleteTagFolder}
            assignTagToFolder={assignTagToFolder}
            onTagsChanged={async () => {
              await refreshTags()
              await refreshTagFolders()
            }}
          />
        )}

`

const settingsStart = "{tab === 'settings' && ("
const settingsPanel = `{tab === 'settings' && (
          <SettingsTabPanel
            settingsView={settingsView}
            setSettingsView={setSettingsView}
            tagIoScopePath={tagIoScopePath}
            setTagIoScopePath={setTagIoScopePath}
            setImportPreview={setImportPreview}
            setTagIoMsg={setTagIoMsg}
            importPreview={importPreview}
            importDefaultChoice={importDefaultChoice}
            setImportDefaultChoice={setImportDefaultChoice}
            importChoicesByPath={importChoicesByPath}
            setImportChoicesByPath={setImportChoicesByPath}
            importApplying={importApplying}
            tagIoMsg={tagIoMsg}
            chooseTagIoScope={chooseTagIoScope}
            handleExportTagsJson={handleExportTagsJson}
            handleImportPreview={handleImportPreview}
            handleApplyImport={handleApplyImport}
            transferMsg={transferMsg}
            transferRevealPath={transferRevealPath}
            isPackagingTransfer={isPackagingTransfer}
            isImportingUserData={isImportingUserData}
            transferBuildChoiceOpen={transferBuildChoiceOpen}
            setTransferBuildChoiceOpen={setTransferBuildChoiceOpen}
            setTransferMsg={setTransferMsg}
            setTransferProgress={setTransferProgress}
            transferProgress={transferProgress}
            transferProgressPercent={transferProgressPercent}
            handlePackageForTransfer={handlePackageForTransfer}
            handleImportUserDataFromBackup={handleImportUserDataFromBackup}
          />
        )}

`

function replaceBetween(markerStart, markerEnd, insert) {
  const a = s.indexOf(markerStart)
  const b = s.indexOf(markerEnd)
  if (a < 0 || b < 0) throw new Error(`markers not found: ${markerStart} -> ${b}`)
  s = s.slice(0, a) + insert + s.slice(b)
}

replaceBetween("{tab === 'search' && (", "{tab === 'tags' && (", searchPanel)
replaceBetween("{tab === 'tags' && (", "{tab === 'faces' && (", tagsPanel)
replaceBetween(settingsStart, "{tab === 'cloud-sync' && <SyncPage />}", settingsPanel)

fs.writeFileSync(appPath, s)
console.log('App.tsx panels replaced')
