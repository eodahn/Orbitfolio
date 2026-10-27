CREATE TABLE sqlite_import_history (
  fingerprint TEXT PRIMARY KEY,
  counts_json TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
