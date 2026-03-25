# SQLite sync schema (Tags Manager)

Tables mirrored to Supabase (see `supabase/migrations/001_initial_schema.sql`):

| Table | PK | Sync uuid |
|-------|-----|------------|
| tags | id | uuid |
| paths | id | uuid |
| path_tags | (path_id, tag_id) | uuid |
| path_tag_exclusions | (path_id, tag_id) | uuid |
| tag_folders | id | uuid |
| tag_folder_tags | (folder_id, tag_id) | uuid |
| face_people | id | uuid |
| face_embeddings | id | uuid |
| person_profiles | person_id | uuid |

All tables include `created_at`, `updated_at`, `deleted_at` (nullable) after migration.

Discovery query used in code:

```sql
SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
```
