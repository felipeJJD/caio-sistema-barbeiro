CREATE TABLE `platform_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`updated_by_team_member_id` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
