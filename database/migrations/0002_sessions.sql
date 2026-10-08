-- Keep Google identity when a disconnect removes encrypted provider credentials.
ALTER TABLE users ADD COLUMN google_subject text UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_google_subject_present
  CHECK (google_subject IS NULL OR length(google_subject) > 0);
UPDATE users AS u SET google_subject = c.google_subject
FROM google_connections AS c WHERE c.user_id = u.id;

CREATE TABLE browser_sessions (
  session_hash text PRIMARY KEY,
  csrf_hash text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT browser_session_hash_sha256 CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT browser_csrf_hash_sha256 CHECK (csrf_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT browser_session_expiry_order CHECK (expires_at > created_at)
);
CREATE INDEX browser_sessions_expiry_idx ON browser_sessions(expires_at);
CREATE INDEX browser_sessions_user_idx ON browser_sessions(user_id);
