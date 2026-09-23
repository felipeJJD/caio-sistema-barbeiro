ALTER TABLE `team` ADD `deleted_at` text;
--> statement-breakpoint
CREATE TABLE `pending_registrations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `kind` text NOT NULL,
  `source_invite_id` integer NOT NULL,
  `organization_id` integer,
  `team_member_id` integer,
  `affiliate_id` integer,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `role` text DEFAULT '' NOT NULL,
  `access_role` text DEFAULT '' NOT NULL,
  `commission_rate_bps` integer DEFAULT 0 NOT NULL,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `password_iterations` integer DEFAULT 100000 NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_registrations_token_hash_unique` ON `pending_registrations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `pending_registrations_email_kind_idx` ON `pending_registrations` (`email`,`kind`,`created_at`);
--> statement-breakpoint
CREATE INDEX `pending_registrations_source_idx` ON `pending_registrations` (`kind`,`source_invite_id`);
