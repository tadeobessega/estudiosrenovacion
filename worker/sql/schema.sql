CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  titulo      TEXT NOT NULL,
  tag         TEXT NOT NULL DEFAULT 'Informe',
  centro      TEXT NOT NULL,
  fecha       TEXT,
  pdf_url     TEXT,
  descripcion TEXT NOT NULL DEFAULT '',
  destacado   INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_centro ON reports (centro, fecha);
CREATE TABLE IF NOT EXISTS miembros (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  cargo       TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  centro      TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS users (
  email         TEXT PRIMARY KEY,
  password_hash TEXT,
  salt          TEXT,
  centro        TEXT NOT NULL DEFAULT '',
  approved      INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
