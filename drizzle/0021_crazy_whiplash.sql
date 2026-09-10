CREATE TABLE `platform_billing_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`pix_price_cents` integer DEFAULT 499 NOT NULL,
	`pix_period_days` integer DEFAULT 30 NOT NULL,
	`updated_by_team_member_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `payment_method_id` integer DEFAULT 0 NOT NULL;