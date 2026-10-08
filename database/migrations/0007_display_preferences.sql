ALTER TABLE users ADD COLUMN display_window_days integer NOT NULL DEFAULT 30
  CONSTRAINT users_display_window_days_range CHECK (display_window_days BETWEEN 1 AND 365);
