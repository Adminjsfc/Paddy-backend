ALTER TABLE sessions
 ADD COLUMN refresh_token_hash CHAR(64) NULL,
 ADD COLUMN refresh_expires_at DATETIME(3) NULL,
 ADD UNIQUE INDEX uq_session_refresh (refresh_token_hash);
