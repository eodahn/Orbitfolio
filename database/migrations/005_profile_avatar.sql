-- Development / migration-copy compatibility. Production uses PostgreSQL.
ALTER TABLE users ADD COLUMN avatar_zoom REAL NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN avatar_offset_x REAL NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN avatar_offset_y REAL NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
CREATE TABLE user_avatars (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data BLOB NOT NULL,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL,
 version TEXT NOT NULL
);
