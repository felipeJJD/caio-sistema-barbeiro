CREATE TABLE `signup_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signup_attempts_ip_created_idx` ON `signup_attempts` (`ip_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `owner_whatsapp` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `signup_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `terms_accepted_at` text;