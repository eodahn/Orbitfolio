-- PostgreSQL schema, independent of the preserved SQLite migration history.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
  email TEXT NOT NULL,
  password_hash TEXT,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 500),
  languages_json TEXT NOT NULL DEFAULT '{}',
  github_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  views BIGINT NOT NULL DEFAULT 0 CHECK(views >= 0),
  rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 200),
  author_name TEXT NOT NULL,
  committed_at TEXT NOT NULL
);
CREATE TABLE project_likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (follower_id, followed_id),
  CHECK(follower_id <> followed_id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX projects_owner_idx ON projects(owner_id);
CREATE INDEX commits_project_idx ON commits(project_id, committed_at DESC);
CREATE INDEX likes_project_idx ON project_likes(project_id, created_at);

ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = 'viajante-' || id;
CREATE UNIQUE INDEX users_username_idx ON users(lower(username));
ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';
CREATE TABLE profile_privacy (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK(category IN ('followers','following','friends','likes','favorites')),
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
 PRIMARY KEY(user_id, category)
);
CREATE INDEX follows_target_idx ON follows(followed_id, follower_id);
ALTER TABLE projects ADD COLUMN size_bytes BIGINT NOT NULL DEFAULT 0 CHECK(size_bytes >= 0);

ALTER TABLE projects ADD COLUMN description_text TEXT;
ALTER TABLE projects ADD COLUMN repository_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN github_repository_id BIGINT;
ALTER TABLE projects ADD COLUMN github_repository_owner TEXT;
ALTER TABLE projects ADD COLUMN github_repository_name TEXT;
ALTER TABLE projects ADD COLUMN github_repository_full_name TEXT;
ALTER TABLE projects ADD COLUMN github_default_branch TEXT;
ALTER TABLE projects ADD COLUMN github_integration_enabled BIGINT NOT NULL DEFAULT 0 CHECK(github_integration_enabled IN (0,1));
ALTER TABLE projects ADD COLUMN github_private BIGINT NOT NULL DEFAULT 0 CHECK(github_private IN (0,1));
ALTER TABLE projects ADD COLUMN language_bytes_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN orbit_x DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN orbit_y DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN orbit_z DOUBLE PRECISION;
CREATE TABLE github_connections (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 github_user_id BIGINT NOT NULL,
 github_login TEXT NOT NULL,
 encrypted_token TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE github_oauth_states (
 state_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL,
 encrypted_verifier TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);
CREATE TABLE project_imports (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 metadata_json TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);
CREATE INDEX projects_github_owner_idx ON projects(owner_id,github_integration_enabled);

ALTER TABLE github_connections ADD COLUMN github_name TEXT;
ALTER TABLE github_connections ADD COLUMN github_avatar_url TEXT;
ALTER TABLE github_connections ADD COLUMN github_profile_url TEXT;

CREATE UNIQUE INDEX users_email_idx ON users(lower(email));
