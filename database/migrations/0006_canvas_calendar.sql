-- A Canvas feed is a credential. Only its encrypted envelope is persisted;
-- subscription deletion and user deletion also remove the atomic local snapshot.
CREATE TABLE canvas_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  encrypted_feed_url text NOT NULL,
  refresh_token uuid NOT NULL,
  status text NOT NULL DEFAULT 'Refreshing',
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_revision uuid,
  last_successful_fetch_at timestamptz,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_feed_envelope CHECK (encrypted_feed_url ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'),
  CONSTRAINT canvas_status CHECK (status IN ('Refreshing', 'Ready', 'Failed')),
  CONSTRAINT canvas_snapshot_bounded CHECK (jsonb_typeof(snapshot) = 'array' AND jsonb_array_length(snapshot) <= 1000),
  CONSTRAINT canvas_snapshot_success CHECK ((snapshot_revision IS NULL) = (last_successful_fetch_at IS NULL)),
  CONSTRAINT canvas_initial_snapshot_empty CHECK (snapshot_revision IS NOT NULL OR snapshot = '[]'::jsonb),
  CONSTRAINT canvas_ready_snapshot CHECK (status <> 'Ready' OR snapshot_revision IS NOT NULL),
  CONSTRAINT canvas_error_status CHECK ((status = 'Failed') = (error IS NOT NULL))
);
