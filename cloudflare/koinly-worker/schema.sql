CREATE TABLE IF NOT EXISTS koinly_transactions (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_koinly_transactions_timestamp
  ON koinly_transactions(timestamp DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
