PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`team_member_id` integer NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer DEFAULT 100000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_auth_accounts`("id", "organization_id", "team_member_id", "email", "password_hash", "password_salt", "password_iterations", "created_at", "updated_at") SELECT "id", "organization_id", "team_member_id", "email", "password_hash", "password_salt", "password_iterations", "created_at", "updated_at" FROM `auth_accounts`;--> statement-breakpoint
DROP TABLE `auth_accounts`;--> statement-breakpoint
ALTER TABLE `__new_auth_accounts` RENAME TO `auth_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_email_unique` ON `auth_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_team_member_unique` ON `auth_accounts` (`team_member_id`);