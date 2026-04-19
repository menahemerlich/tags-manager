import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/renderer/src/App.tsx')
let s = fs.readFileSync(appPath, 'utf8')

const library = `{tab === 'library' && (
          <LibraryTabPanel
            librarySelectedItems={librarySelectedItems}
            libraryTags={libraryTags}
            libraryTagDraft={libraryTagDraft}
            setLibraryTagDraft={setLibraryTagDraft}
            libraryFolderSuggestions={libraryFolderSuggestions}
            tags={tags}
            tagFolders={tagFolders}
            expandedLibraryFolderIds={expandedLibraryFolderIds}
            setExpandedLibraryFolderIds={setExpandedLibraryFolderIds}
            folderIdByTagId={folderIdByTagId}
            onPickFiles={handlePickFiles}
            onPickFolders={handlePickFolders}
            onOpenInWatermark={openPreviewInWatermarkTab}
            onOpenInFaces={openPreviewInFacesTab}
            requestAddLibraryTag={requestAddLibraryTag}
            removeLibraryTag={removeLibraryTag}
            getTagClassName={getTagClassName}
            getTagAccentStyle={getTagAccentStyle}
            formatTagLabel={formatTagLabel}
            onSaveAndDone={handleLibrarySaveAndDone}
            onCancel={handleLibraryCancel}
          />
        )}

`

const search = `{tab === 'search' && (
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

const tags = `{tab === 'tags' && (
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

const settings = `{tab === 'settings' && (
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

const overlays = `      <AppOverlays
        indexing={indexing}
        onCancelIndex={handleCancelIndex}
        importApplying={importApplying}
        importProgress={importProgress}
        tagFolderPicker={tagFolderPicker}
        tagFolders={tagFolders}
        setTagFolderPicker={setTagFolderPicker}
        closeTagFolderPicker={closeTagFolderPicker}
        searchTagsModal={searchTagsModal}
        setSearchTagsModal={setSearchTagsModal}
        getTagClassName={getTagClassName}
        getTagAccentStyle={getTagAccentStyle}
        formatTagLabel={formatTagLabel}
      />
`

function replaceBetween(startTok, endTok, insert) {
  const a = s.indexOf(startTok)
  const b = s.indexOf(endTok, a + 1)
  if (a < 0 || b < 0) throw new Error(`replace failed: ${startTok} a=${a} b=${b}`)
  s = s.slice(0, a) + insert + s.slice(b)
}

replaceBetween("{tab === 'library' && (", "{tab === 'search' && (", library)
replaceBetween("{tab === 'search' && (", "{tab === 'tags' && (", search)
replaceBetween("{tab === 'tags' && (", "{tab === 'faces' && (", tags)
replaceBetween("{tab === 'settings' && (", '      </main>', settings)

const ovStart = s.indexOf('{indexing &&')
const ovEnd = s.indexOf('<footer className="app-footer">')
if (ovStart < 0 || ovEnd < 0) throw new Error('overlay/footer markers')
s = s.slice(0, ovStart) + overlays + '\n\n      ' + s.slice(ovEnd)

fs.writeFileSync(appPath, s, 'utf8')
console.log('apply-panels done')
