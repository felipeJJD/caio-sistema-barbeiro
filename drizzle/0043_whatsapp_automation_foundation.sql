CREATE TABLE `whatsapp_connections` (
  `organization_id` integer PRIMARY KEY NOT NULL,
  `provider` text DEFAULT 'meta_cloud' NOT NULL,
  `status` text DEFAULT 'disconnected' NOT NULL,
  `waba_id` text DEFAULT '' NOT NULL,
  `phone_number_id` text DEFAULT '' NOT NULL,
  `display_phone_number` text DEFAULT '' NOT NULL,
  `encrypted_access_token` text DEFAULT '' NOT NULL,
  `access_token_iv` text DEFAULT '' NOT NULL,
  `connected_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `whatsapp_connections_phone_number_unique` ON `whatsapp_connections` (`phone_number_id`);

CREATE TABLE `whatsapp_automation_settings` (
  `organization_id` integer PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT false NOT NULL,
  `confirmation_enabled` integer DEFAULT true NOT NULL,
  `reminder_enabled` integer DEFAULT true NOT NULL,
  `reminder_hours_before` integer DEFAULT 3 NOT NULL,
  `cancellation_enabled` integer DEFAULT true NOT NULL,
  `reschedule_enabled` integer DEFAULT true NOT NULL,
  `bot_enabled` integer DEFAULT false NOT NULL,
  `human_takeover_minutes` integer DEFAULT 120 NOT NULL,
  `plan_code` text DEFAULT 'off' NOT NULL,
  `monthly_message_limit` integer DEFAULT 0 NOT NULL,
  `confirmation_template` text DEFAULT 'ca_booking_confirmed' NOT NULL,
  `reminder_template` text DEFAULT 'ca_booking_reminder' NOT NULL,
  `cancellation_template` text DEFAULT 'ca_booking_cancelled' NOT NULL,
  `reschedule_template` text DEFAULT 'ca_booking_rescheduled' NOT NULL,
  `template_language` text DEFAULT 'pt_BR' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE `whatsapp_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `appointment_id` integer,
  `direction` text DEFAULT 'outbound' NOT NULL,
  `kind` text NOT NULL,
  `phone` text NOT NULL,
  `template_name` text DEFAULT '' NOT NULL,
  `dedupe_key` text DEFAULT '' NOT NULL,
  `provider_message_id` text,
  `status` text DEFAULT 'queued' NOT NULL,
  `scheduled_at` text NOT NULL,
  `sent_at` text,
  `delivered_at` text,
  `read_at` text,
  `failed_at` text,
  `error_text` text DEFAULT '' NOT NULL,
  `payload_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `whatsapp_messages_org_dedupe_unique` ON `whatsapp_messages` (`organization_id`, `dedupe_key`);
CREATE UNIQUE INDEX `whatsapp_messages_provider_message_unique` ON `whatsapp_messages` (`provider_message_id`);
CREATE INDEX `whatsapp_messages_org_status_schedule_idx` ON `whatsapp_messages` (`organization_id`, `status`, `scheduled_at`);
CREATE INDEX `whatsapp_messages_appointment_idx` ON `whatsapp_messages` (`organization_id`, `appointment_id`);

CREATE TABLE `whatsapp_conversations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `phone` text NOT NULL,
  `automation_paused_until` text,
  `pause_reason` text DEFAULT '' NOT NULL,
  `last_inbound_at` text,
  `last_outbound_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `whatsapp_conversations_org_phone_unique` ON `whatsapp_conversations` (`organization_id`, `phone`);
CREATE INDEX `whatsapp_conversations_org_pause_idx` ON `whatsapp_conversations` (`organization_id`, `automation_paused_until`);
