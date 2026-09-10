CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_hash_unique` ON `password_resets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_resets_account_created_idx` ON `password_resets` (`account_id`,`created_at`);