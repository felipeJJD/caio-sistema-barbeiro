CREATE TABLE `affiliate_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer DEFAULT 100000 NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_accounts_affiliate_unique` ON `affiliate_accounts` (`affiliate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_accounts_email_unique` ON `affiliate_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `affiliate_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`created_by_team_member_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_invites_token_hash_unique` ON `affiliate_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `affiliate_invites_affiliate_idx` ON `affiliate_invites` (`affiliate_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `affiliate_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_sessions_account_idx` ON `affiliate_sessions` (`account_id`);--> statement-breakpoint
ALTER TABLE `affiliate_links` ADD `label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliate_links` ADD `created_by_affiliate_account_id` integer;