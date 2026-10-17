-- Adds folders. Run ONCE, from the worker folder:
--   npx wrangler d1 execute chunky-drive --remote --file=../sql/add-folders.sql
-- (Running it twice fails on the ALTER TABLE line, which is harmless.)
-- Existing files get folder_id = NULL, which means "My Drive" (the top level).

CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,  -- NULL = top level
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- No two folders with the same name (ignoring case) side by side.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name ON folders(owner_id, COALESCE(parent_id, ''), name COLLATE NOCASE);

ALTER TABLE files ADD COLUMN folder_id TEXT REFERENCES folders(id);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(owner_id, folder_id);
