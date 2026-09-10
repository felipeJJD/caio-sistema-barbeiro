CREATE TABLE `organizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
INSERT INTO `organizations` (`id`, `name`, `slug`) VALUES (1, 'Kaio Barbearia', 'kaio-barbearia');--> statement-breakpoint
ALTER TABLE `appointments` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendances` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_records` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_methods` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `team` ADD `organization_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `team` ADD `login_email` text;--> statement-breakpoint
ALTER TABLE `team` ADD `access_role` text DEFAULT 'barber' NOT NULL;--> statement-breakpoint
UPDATE `team` SET `login_email` = 'owner@example.invalid', `access_role` = 'owner' WHERE lower(`name`) = 'kaio';--> statement-breakpoint
UPDATE `team` SET `login_email` = 'barber@example.invalid', `access_role` = 'barber' WHERE lower(`name`) = 'eduardo';--> statement-breakpoint
CREATE UNIQUE INDEX `team_login_email_unique` ON `team` (`login_email`);
