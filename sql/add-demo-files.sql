-- Demo files for portfolio screenshots. Safe to run more than once: skips files already added.
-- Remove them with remove-demo-files.sql (matches the all-zero file_hash).
INSERT INTO files (id, owner_id, name, size, mime_type, file_hash, channel_id, chunk_count, status, created_at)
SELECT lower(hex(randomblob(16))), u.id, 'trip-highlights-4k.mp4', 1503238553, 'video/mp4', '0000000000000000000000000000000000000000000000000000000000000000', 'demo', 180, 'ready', datetime('now', '-3 days')
FROM user u WHERE u.email = 'stfu110700@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.owner_id = u.id AND f.name = 'trip-highlights-4k.mp4' AND f.file_hash = '0000000000000000000000000000000000000000000000000000000000000000');
INSERT INTO files (id, owner_id, name, size, mime_type, file_hash, channel_id, chunk_count, status, created_at)
SELECT lower(hex(randomblob(16))), u.id, 'project-backup.zip', 673185792, 'application/zip', '0000000000000000000000000000000000000000000000000000000000000000', 'demo', 81, 'ready', datetime('now', '-2 days')
FROM user u WHERE u.email = 'stfu110700@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.owner_id = u.id AND f.name = 'project-backup.zip' AND f.file_hash = '0000000000000000000000000000000000000000000000000000000000000000');
INSERT INTO files (id, owner_id, name, size, mime_type, file_hash, channel_id, chunk_count, status, created_at)
SELECT lower(hex(randomblob(16))), u.id, 'lecture-recordings.mp4', 2254857830, 'video/mp4', '0000000000000000000000000000000000000000000000000000000000000000', 'demo', 269, 'ready', datetime('now', '-5 days')
FROM user u WHERE u.email = 'stfu110700@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.owner_id = u.id AND f.name = 'lecture-recordings.mp4' AND f.file_hash = '0000000000000000000000000000000000000000000000000000000000000000');
INSERT INTO files (id, owner_id, name, size, mime_type, file_hash, channel_id, chunk_count, status, created_at)
SELECT lower(hex(randomblob(16))), u.id, 'resume-2026.pdf', 412330, 'application/pdf', '0000000000000000000000000000000000000000000000000000000000000000', 'demo', 1, 'ready', datetime('now', '-1 days')
FROM user u WHERE u.email = 'stfu110700@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.owner_id = u.id AND f.name = 'resume-2026.pdf' AND f.file_hash = '0000000000000000000000000000000000000000000000000000000000000000');
