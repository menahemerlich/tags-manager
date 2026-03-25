-- Tags Manager: mirror of local SQLite sync model (uuid-centric, row-level sync).
-- Run in Supabase SQL Editor or via supabase db push.
-- Timestamps are stored as TEXT (ISO-ish) to match sql.js exports.

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  uuid UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tags_updated_at ON tags (updated_at);
CREATE INDEX IF NOT EXISTS idx_tags_deleted_at ON tags (deleted_at);

-- Paths
CREATE TABLE IF NOT EXISTS paths (
  uuid UUID PRIMARY KEY,
  path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_paths_updated_at ON paths (updated_at);
CREATE INDEX IF NOT EXISTS idx_paths_deleted_at ON paths (deleted_at);

-- path_tags (logical FKs by uuid)
CREATE TABLE IF NOT EXISTS path_tags (
  uuid UUID PRIMARY KEY,
  path_uuid UUID NOT NULL REFERENCES paths (uuid) ON DELETE CASCADE,
  tag_uuid UUID NOT NULL REFERENCES tags (uuid) ON DELETE CASCADE,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  UNIQUE (path_uuid, tag_uuid)
);

CREATE INDEX IF NOT EXISTS idx_path_tags_updated_at ON path_tags (updated_at);

-- path_tag_exclusions
CREATE TABLE IF NOT EXISTS path_tag_exclusions (
  uuid UUID PRIMARY KEY,
  path_uuid UUID NOT NULL REFERENCES paths (uuid) ON DELETE CASCADE,
  tag_uuid UUID NOT NULL REFERENCES tags (uuid) ON DELETE CASCADE,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  UNIQUE (path_uuid, tag_uuid)
);

CREATE INDEX IF NOT EXISTS idx_path_tag_exclusions_updated_at ON path_tag_exclusions (updated_at);

-- Tag folders
CREATE TABLE IF NOT EXISTS tag_folders (
  uuid UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tag_folders_updated_at ON tag_folders (updated_at);

-- tag_folder_tags
CREATE TABLE IF NOT EXISTS tag_folder_tags (
  uuid UUID PRIMARY KEY,
  folder_uuid UUID NOT NULL REFERENCES tag_folders (uuid) ON DELETE CASCADE,
  tag_uuid UUID NOT NULL REFERENCES tags (uuid) ON DELETE CASCADE,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  UNIQUE (folder_uuid, tag_uuid)
);

CREATE INDEX IF NOT EXISTS idx_tag_folder_tags_updated_at ON tag_folder_tags (updated_at);

-- Face people
CREATE TABLE IF NOT EXISTS face_people (
  uuid UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_face_people_updated_at ON face_people (updated_at);

-- Face embeddings
CREATE TABLE IF NOT EXISTS face_embeddings (
  uuid UUID PRIMARY KEY,
  person_uuid UUID NOT NULL REFERENCES face_people (uuid) ON DELETE CASCADE,
  embedding_json TEXT NOT NULL,
  model_id TEXT,
  embedding_dim INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_updated_at ON face_embeddings (updated_at);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_person_uuid ON face_embeddings (person_uuid);

-- Person profiles (centroid / medoid blobs)
CREATE TABLE IF NOT EXISTS person_profiles (
  uuid UUID PRIMARY KEY,
  person_uuid UUID NOT NULL UNIQUE REFERENCES face_people (uuid) ON DELETE CASCADE,
  medoid BYTEA NOT NULL,
  trimmed_mean BYTEA NOT NULL,
  sample_count INTEGER NOT NULL,
  last_updated TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_person_profiles_updated_at ON person_profiles (updated_at);

-- Row Level Security: desktop app uses anon key from settings — permissive policies for sync.
-- For production, replace with authenticated users or service_role from a secure backend.
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_tag_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_folder_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_sync_all" ON tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "paths_sync_all" ON paths FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "path_tags_sync_all" ON path_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "path_tag_exclusions_sync_all" ON path_tag_exclusions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tag_folders_sync_all" ON tag_folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tag_folder_tags_sync_all" ON tag_folder_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "face_people_sync_all" ON face_people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "face_embeddings_sync_all" ON face_embeddings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "person_profiles_sync_all" ON person_profiles FOR ALL USING (true) WITH CHECK (true);
