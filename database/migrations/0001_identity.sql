CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND length(email) > 3),
  CONSTRAINT users_timezone_present CHECK (length(btrim(timezone)) > 0)
);

CREATE TABLE google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_subject text NOT NULL UNIQUE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_subject_present CHECK (length(google_subject) > 0),
  CONSTRAINT google_access_envelope CHECK (access_token_encrypted ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'),
  CONSTRAINT google_refresh_envelope CHECK (refresh_token_encrypted IS NULL OR refresh_token_encrypted ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'),
  CONSTRAINT google_scopes_present CHECK (cardinality(scopes) > 0)
);

CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY,
  browser_binding_hash text NOT NULL,
  pkce_verifier_encrypted text NOT NULL,
  nonce_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT oauth_state_hash_sha256 CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT oauth_binding_hash_sha256 CHECK (browser_binding_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT oauth_nonce_hash_sha256 CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT oauth_pkce_envelope CHECK (pkce_verifier_encrypted ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'),
  CONSTRAINT oauth_expiry_order CHECK (expires_at > created_at),
  CONSTRAINT oauth_consumption_order CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at))
);
CREATE INDEX oauth_states_expiry_idx ON oauth_states(expires_at);
