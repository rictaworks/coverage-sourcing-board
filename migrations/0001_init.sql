-- 0001_init.sql：D1 の初期スキーマ（requirements 6 章）。
-- 日時は JST の文字列（ISO 8601、+09:00）で保存する。daily_counter の日付は UTC（UTC 0 時にリセット）。
-- 全テーブル（daily_counter を除く）は session_id を持ち、session_id の索引を作る。session は id_hash が主キー。
-- 位置情報（緯度・経度）と機種情報の列は作らない（CLAUDE.md 8）。

CREATE TABLE session (
  id_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
);

CREATE TABLE campaign (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
);
CREATE INDEX idx_campaign_session ON campaign(session_id);

CREATE TABLE area (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  prefecture TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized TEXT NOT NULL,
  bbox TEXT
);
CREATE INDEX idx_area_session ON area(session_id);

CREATE TABLE period (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  label TEXT NOT NULL,
  months TEXT NOT NULL
);
CREATE INDEX idx_period_session ON period(session_id);

CREATE TABLE cell (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  area_id TEXT NOT NULL REFERENCES area(id),
  period_id TEXT NOT NULL REFERENCES period(id),
  required INTEGER NOT NULL CHECK (required >= 0)
);
CREATE INDEX idx_cell_session ON cell(session_id);

CREATE TABLE accept_rule (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  campaign_id TEXT NOT NULL UNIQUE REFERENCES campaign(id),
  ratio REAL NOT NULL,
  tolerance REAL NOT NULL,
  orientation TEXT NOT NULL,
  formats TEXT NOT NULL,
  min_short_px INTEGER NOT NULL,
  blur_min REAL NOT NULL,
  dup_distance INTEGER NOT NULL,
  daytime_required INTEGER NOT NULL CHECK (daytime_required IN (0, 1)),
  max_input_bytes INTEGER NOT NULL,
  max_pixels INTEGER NOT NULL
);
CREATE INDEX idx_accept_rule_session ON accept_rule(session_id);

CREATE TABLE submission (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  cell_id TEXT NOT NULL REFERENCES cell(id),
  shot_month INTEGER NOT NULL CHECK (shot_month BETWEEN 1 AND 12),
  spot_name TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  image BLOB NOT NULL,
  phash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('checking', 'pending_review', 'accepted', 'returned')),
  over_quota INTEGER NOT NULL DEFAULT 0 CHECK (over_quota IN (0, 1)),
  declared_original INTEGER NOT NULL CHECK (declared_original IN (0, 1)),
  consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
  resubmitted_from TEXT REFERENCES submission(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
);
CREATE INDEX idx_submission_session ON submission(session_id);
CREATE INDEX idx_submission_cell ON submission(cell_id);

CREATE TABLE check_result (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  submission_id TEXT NOT NULL REFERENCES submission(id),
  item TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'review', 'info')),
  reason TEXT NOT NULL,
  confidence REAL,
  model TEXT
);
CREATE INDEX idx_check_result_session ON check_result(session_id);

CREATE TABLE review (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id_hash),
  submission_id TEXT NOT NULL UNIQUE REFERENCES submission(id),
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'return', 'revoke')),
  reason TEXT,
  resubmittable INTEGER CHECK (resubmittable IN (0, 1)),
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
);
CREATE INDEX idx_review_session ON review(session_id);

CREATE TABLE daily_counter (
  date_utc TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  estimated_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date_utc, kind)
);
