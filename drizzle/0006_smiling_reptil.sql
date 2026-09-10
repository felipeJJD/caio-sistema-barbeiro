CREATE TABLE `team_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`invited_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'Barbeiro' NOT NULL,
	`access_role` text DEFAULT 'barber' NOT NULL,
	`commission_rate_bps` integer DEFAULT 5000 NOT NULL,
	`created_by_team_member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_token_hash_unique` ON `team_invites` (`token_hash`);