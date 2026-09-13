CREATE TABLE `team_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`team_member_id` integer NOT NULL,
	`team_member_name` text NOT NULL,
	`occurred_at` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`value_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_payments_organization_date_idx` ON `team_payments` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `team_payments_member_date_idx` ON `team_payments` (`team_member_id`,`occurred_at`);