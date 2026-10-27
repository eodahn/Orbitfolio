ALTER TABLE users ADD COLUMN avatar_zoom DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK(avatar_zoom BETWEEN 1 AND 3);
ALTER TABLE users ADD COLUMN avatar_offset_x DOUBLE PRECISION NOT NULL DEFAULT 50 CHECK(avatar_offset_x BETWEEN 0 AND 100);
ALTER TABLE users ADD COLUMN avatar_offset_y DOUBLE PRECISION NOT NULL DEFAULT 50 CHECK(avatar_offset_y BETWEEN 0 AND 100);
ALTER TABLE users ADD COLUMN is_demo BIGINT NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1));
-- NOT VALID preserves legacy records already in PostgreSQL; new writes respect limits.
ALTER TABLE users ADD CONSTRAINT users_display_name_limit CHECK(length(name) BETWEEN 2 AND 50) NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_username_limit CHECK(username IS NOT NULL AND length(username) BETWEEN 3 AND 50) NOT VALID;
ALTER TABLE projects ADD CONSTRAINT projects_name_limit CHECK(length(name) BETWEEN 2 AND 50) NOT VALID;
ALTER TABLE projects ADD CONSTRAINT projects_description_limit CHECK(length(COALESCE(description_text,description)) <= 350) NOT VALID;
CREATE TABLE user_avatars (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data BYTEA NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 5242880),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
 size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 version TEXT NOT NULL
);
