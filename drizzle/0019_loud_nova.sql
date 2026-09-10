CREATE TABLE `email_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`trial_days` integer DEFAULT 14 NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verifications_token_hash_unique` ON `email_verifications` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verifications_account_created_idx` ON `email_verifications` (`account_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD `email_verified_at` text;--> statement-breakpoint
UPDATE `auth_accounts` SET `email_verified_at` = CURRENT_TIMESTAMP WHERE `email_verified_at` IS NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `owner_document_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_owner_document_unique` ON `organizations` (`owner_document_hash`);
