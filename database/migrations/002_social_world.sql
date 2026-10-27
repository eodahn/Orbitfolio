ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = 'viajante-' || id;
CREATE UNIQUE INDEX users_username_idx ON users(username COLLATE NOCASE);
ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';
CREATE TABLE profile_privacy (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK(category IN ('followers','following','friends','likes','favorites')),
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
 PRIMARY KEY(user_id, category)
);
CREATE INDEX follows_target_idx ON follows(followed_id, follower_id);
ALTER TABLE projects ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(size_bytes >= 0);
