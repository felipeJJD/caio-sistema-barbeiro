PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_platform_billing_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`pix_price_cents` integer DEFAULT 999 NOT NULL,
	`pix_period_days` integer DEFAULT 30 NOT NULL,
	`quarterly_discount_bps` integer DEFAULT 1000 NOT NULL,
	`semiannual_discount_bps` integer DEFAULT 1500 NOT NULL,
	`annual_discount_bps` integer DEFAULT 2000 NOT NULL,
	`updated_by_team_member_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_platform_billing_settings`("id", "pix_price_cents", "pix_period_days", "quarterly_discount_bps", "semiannual_discount_bps", "annual_discount_bps", "updated_by_team_member_id", "updated_at") SELECT "id", "pix_price_cents", "pix_period_days", 1000, 1500, 2000, "updated_by_team_member_id", "updated_at" FROM `platform_billing_settings`;--> statement-breakpoint
DROP TABLE `platform_billing_settings`;--> statement-breakpoint
ALTER TABLE `__new_platform_billing_settings` RENAME TO `platform_billing_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
