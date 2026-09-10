CREATE TABLE `barbershop_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`invited_label` text DEFAULT 'Nova barbearia' NOT NULL,
	`trial_days` integer DEFAULT 14 NOT NULL,
	`created_by_team_member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`organization_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barbershop_invites_token_hash_unique` ON `barbershop_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `barbershop_invites_created_by_idx` ON `barbershop_invites` (`created_by_team_member_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `trial_ends_at` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `created_by_invite_id` integer;--> statement-breakpoint
ALTER TABLE `team` ADD `platform_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `team` SET `platform_admin` = true WHERE lower(`login_email`) = 'owner@example.invalid';
