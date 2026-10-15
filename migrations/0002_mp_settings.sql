CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
