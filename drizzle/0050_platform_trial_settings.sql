CREATE TABLE `platform_trial_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`trial_days` integer DEFAULT 14 NOT NULL,
	`updated_by_team_member_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `platform_trial_settings` (`id`, `trial_days`, `updated_at`) VALUES (1, 14, CURRENT_TIMESTAMP);