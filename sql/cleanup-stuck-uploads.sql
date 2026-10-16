-- Removes uploads that never finished: the same as the Worker's nightly cleanup, run by hand.
-- Run from the worker folder:
--   npx wrangler d1 execute chunky-drive --remote --file=../sql/cleanup-stuck-uploads.sql
--
-- Only touches uploads older than 1 hour, so anything uploading right now is left alone.
-- The stored chunks on the storage network stay in place, like when a file is deleted.

DELETE FROM thumbnails WHERE file_id IN (
  SELECT id FROM files WHERE status != 'ready' AND created_at < datetime('now', '-1 hour')
);

DELETE FROM chunks WHERE file_id IN (
  SELECT id FROM files WHERE status != 'ready' AND created_at < datetime('now', '-1 hour')
);

DELETE FROM files WHERE status != 'ready' AND created_at < datetime('now', '-1 hour');
