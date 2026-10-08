CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_suggestion_id uuid UNIQUE,
  source_email_id uuid,
  request_id uuid,
  request_content jsonb,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Waiting for Reply', 'Completed')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (user_id, source_suggestion_id, source_email_id)
    REFERENCES suggestions(user_id, id, email_id) ON DELETE CASCADE,
  CONSTRAINT tasks_source_pair CHECK (
    (source_suggestion_id IS NOT NULL AND source_email_id IS NOT NULL AND request_id IS NULL AND request_content IS NULL)
    OR (source_suggestion_id IS NULL AND source_email_id IS NULL AND request_id IS NOT NULL AND request_content IS NOT NULL)
  ),
  CONSTRAINT tasks_completion CHECK ((status = 'Completed') = (completed_at IS NOT NULL))
);
CREATE INDEX tasks_user_page_idx ON tasks(user_id, created_at DESC, id DESC);

CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  requested_at timestamptz NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, request_id)
);

CREATE TABLE calendar_event_links (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  calendar_id text NOT NULL DEFAULT 'primary' CHECK (calendar_id = 'primary'),
  google_event_id text NOT NULL UNIQUE CHECK (google_event_id ~ '^[0-9a-v]{5,1024}$'),
  request_id uuid NOT NULL,
  request_content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Created', 'Failed')),
  html_link text,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_link_error CHECK ((status = 'Failed') = (error IS NOT NULL))
);

CREATE TABLE calendar_snapshots (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  last_successful_fetch_at timestamptz,
  error jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
