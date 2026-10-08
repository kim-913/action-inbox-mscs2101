CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Running','Succeeded','Failed')),
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX sync_runs_one_active ON sync_runs(user_id) WHERE status IN ('Queued','Running');
CREATE INDEX sync_runs_user_created ON sync_runs(user_id,created_at DESC,id DESC);
CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL,
  sender text NOT NULL,
  subject text NOT NULL,
  received_at timestamptz NOT NULL,
  normalized_body text NOT NULL,
  body_hash text NOT NULL,
  category text CHECK (category IN ('Action Required','Read / Review','Reference')),
  extraction_status text NOT NULL DEFAULT 'Pending' CHECK (extraction_status IN ('Pending','Succeeded','Failed')),
  extraction_error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,gmail_message_id),
  UNIQUE(user_id,id)
);
CREATE INDEX email_messages_user_received ON email_messages(user_id,received_at DESC,id DESC);
CREATE TABLE extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid NOT NULL,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  extractor_version text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('Running','Succeeded','Failed')),
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY(user_id,email_id) REFERENCES email_messages(user_id,id) ON DELETE CASCADE
);
CREATE TABLE suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('Action Required','Read / Review','Reference')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  due_at timestamptz,
  deadline_certainty text NOT NULL CHECK (deadline_certainty IN ('Explicit','Uncertain','None')),
  confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence jsonb NOT NULL,
  deadline_evidence jsonb,
  needs_review boolean NOT NULL,
  review_reason text,
  review_state text NOT NULL DEFAULT 'Proposed' CHECK (review_state IN ('Proposed','Approved','Rejected')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  fingerprint text NOT NULL,
  action_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,fingerprint),
  UNIQUE(user_id,email_id,action_key),
  UNIQUE(user_id,id,email_id),
  FOREIGN KEY(user_id,email_id) REFERENCES email_messages(user_id,id) ON DELETE CASCADE
);
