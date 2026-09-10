CREATE TABLE `security_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_attempts_scope_key_created_idx` ON `security_attempts` (`scope`,`key_hash`,`created_at`);