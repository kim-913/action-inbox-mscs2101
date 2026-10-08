-- PostgreSQL ARE repetition bounds cannot exceed 255. Google permits IDs up
-- to 1024 characters, so validate the alphabet and length independently.
ALTER TABLE calendar_event_links
  DROP CONSTRAINT calendar_event_links_google_event_id_check,
  ADD CONSTRAINT calendar_event_links_google_event_id_check
    CHECK (google_event_id ~ '^[0-9a-v]+$' AND length(google_event_id) BETWEEN 5 AND 1024);
