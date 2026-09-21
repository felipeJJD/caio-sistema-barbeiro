ALTER TABLE whatsapp_conversations ADD COLUMN unresolved_turns integer NOT NULL DEFAULT 0;

CREATE TABLE ai_usage_events (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  organization_id integer NOT NULL,
  surface text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ai_usage_events_org_created_idx
  ON ai_usage_events (organization_id, created_at);

CREATE INDEX ai_usage_events_org_surface_created_idx
  ON ai_usage_events (organization_id, surface, created_at);
