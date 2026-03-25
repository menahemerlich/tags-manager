# Tags Manager (Electron)

Tags Manager is a Windows desktop app for organizing **files and folders** using **tags**.  
It stores everything locally in a SQLite database and supports **manual Cloud Sync** to Supabase (PostgreSQL).

## Features

### Library (tag files and folders)
- Pick one or more **files** or **folders**.
- Add/remove tags and save.
- When you tag a folder, the app can index files under it (bulk mode) for faster work.

### Search
- Search by selecting tags.
- Results show file paths and their effective tags.

### Tags management
- List tags.
- Rename tags.
- Soft-delete tags (kept for sync history).
- Tag folders (group tags into folders for better navigation).

### Face recognition
- Local face recognition workflows (face models are downloaded on install).
- Stores embeddings and profiles in the local database.

### Watermark editor
- Add a watermark image, crop/blur tools, preview and export.

### Import / Export
- Export tags data to a JSON file for a selected scope path.
- Import tags JSON with conflict detection and apply strategies.

### Transfer to another computer
- Package an installer + user data files to move the app to another machine.

### Updates
- Optional GitHub repo setting for update checking.

## Data storage

### Local database
- The app stores data at:
  - **`<userData>/tags-manager.sqlite`**
- Settings are stored at:
  - **`<userData>/settings.json`**
- Sync diagnostics:
  - **`<userData>/sync-errors.log`** (keeps last ~500 lines)
- Pending sync conflicts:
  - **`<userData>/pending_conflicts.json`**

`<userData>` is the Electron user data directory (you can open it from the app: **Transfer → Open user data directory**).

### Soft deletes
Synced tables use **soft deletes** (`deleted_at` is set) instead of hard `DELETE`, so other devices can learn about deletions.

## Cloud Sync (Supabase)

Cloud Sync is **manual**:
- Nothing syncs automatically.
- You explicitly press **Push / Pull / Check**.

### What is synced
All app tables used by the SQLite database (see `docs/SYNC_SCHEMA.md`).

Each synced table has:
- `uuid` (sync identity)
- `created_at`, `updated_at`
- `deleted_at` (soft delete marker)

Join tables also include logical UUID references such as:
- `path_uuid`, `tag_uuid`
- `folder_uuid`, `person_uuid`

### How sync works (high level)
- **Push**: takes local rows changed since the last successful push and upserts them to Supabase by `uuid`.
- **Pull**: downloads cloud rows changed since the last successful pull and applies them locally.
- **Conflicts**: if the same record changed both locally and in the cloud since the last pull, it is queued for manual resolution.

### Supabase setup
1. Create a Supabase project.
2. In the app, open **Cloud Sync**.
3. Paste:
   - **Supabase URL** (project base URL)
   - **API key** (anon key is recommended; service role works but is powerful—use carefully)
4. Run the SQL migration in Supabase:
   - In the app click **Copy migration SQL**
   - In Supabase: **SQL Editor → New query → paste → Run**

Migration file in the repo:
- `supabase/migrations/001_initial_schema.sql`

### Buttons

#### Check for changes
- Does lightweight counts to detect whether there are pending changes (local + cloud).
- Does not download actual data rows.

#### Push (upload)
- Uploads only rows where `updated_at` (or `created_at`) is newer than the last push timestamp.
- Uses `upsert` on `uuid` → pushing the same row again updates it (no duplicates).
- Includes a progress panel (table + done/total + percent).
- If a push fails mid-run, the app stores a **per-table checkpoint** and resumes from where it stopped.

#### Pull (download)
- Downloads only rows newer than the last pull timestamp.
- Applies inserts/updates locally.
- Conflicting rows are stored in `pending_conflicts.json` and shown in the UI.

### Conflict resolution
Conflicts are shown as cards:
- Local row vs cloud row
- Choose **Keep mine** or **Use cloud**
- Apply resolutions to update local data and clear resolved conflicts

Unresolved conflicts persist across restarts.

### Common issues

#### “Could not find the table 'public.tags' in the schema cache”
The migration was not applied (or applied to a different schema).  
Run `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor and verify the `tags` table exists in `public`.

#### NetFree / filtered network blocks Supabase
If your network filtering blocks Supabase, you must allow the project domain:
- `<project-ref>.supabase.co`

#### Cloudflare / 502 Bad Gateway
This is usually a temporary server-side issue. Wait a minute and retry.

## Development

### Requirements
- Node.js (LTS recommended)
- Windows (app targets Windows; Electron should work on other OSes with adjustments)

### Install

```bash
npm install
```

Postinstall downloads face recognition models (see `scripts/`).

### Run (dev)

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Build (without installer)

```bash
npm run build:vite
```

### Tests

```bash
npm test
```

## Project structure (high level)
- `src/main/` – Electron main process + SQLite database + sync services
- `src/preload/` – `window.api` bridge (typed in `src/shared/api.ts`)
- `src/renderer/` – React UI
- `src/shared/` – shared types/constants
- `supabase/migrations/` – SQL schema for Supabase

## Security notes
- Do not commit Supabase keys.
- The current Supabase migration enables permissive RLS policies for desktop sync usage. For production-grade security, you should redesign auth and policies.

