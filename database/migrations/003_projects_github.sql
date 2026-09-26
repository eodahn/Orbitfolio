ALTER TABLE projects ADD COLUMN description_text TEXT;
ALTER TABLE projects ADD COLUMN repository_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN github_repository_id INTEGER;
ALTER TABLE projects ADD COLUMN github_repository_owner TEXT;
ALTER TABLE projects ADD COLUMN github_repository_name TEXT;
ALTER TABLE projects ADD COLUMN github_repository_full_name TEXT;
ALTER TABLE projects ADD COLUMN github_default_branch TEXT;
ALTER TABLE projects ADD COLUMN github_integration_enabled INTEGER NOT NULL DEFAULT 0 CHECK(github_integration_enabled IN (0,1));
ALTER TABLE projects ADD COLUMN github_private INTEGER NOT NULL DEFAULT 0 CHECK(github_private IN (0,1));
ALTER TABLE projects ADD COLUMN language_bytes_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN orbit_x REAL;
ALTER TABLE projects ADD COLUMN orbit_y REAL;
ALTER TABLE projects ADD COLUMN orbit_z REAL;
CREATE TABLE github_connections (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 github_user_id INTEGER NOT NULL,
 github_login TEXT NOT NULL,
 encrypted_token TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE github_oauth_states (
 state_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL,
 encrypted_verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE project_imports (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 metadata_json TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX projects_github_owner_idx ON projects(owner_id,github_integration_enabled);
