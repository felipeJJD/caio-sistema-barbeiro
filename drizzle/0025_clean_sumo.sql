CREATE TABLE `membership_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`client_name` text NOT NULL,
	`plan_name` text NOT NULL,
	`plan_kind` text NOT NULL,
	`payment_method_id` integer NOT NULL,
	`payment_name` text NOT NULL,
	`paid_month` text NOT NULL,
	`occurred_at` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_payments_org_client_month_unique` ON `membership_payments` (`organization_id`,`client_id`,`paid_month`);--> statement-breakpoint
CREATE INDEX `membership_payments_organization_month_idx` ON `membership_payments` (`organization_id`,`paid_month`);--> statement-breakpoint
CREATE INDEX `daily_records_organization_date_idx` ON `daily_records` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `daily_records_barber_date_idx` ON `daily_records` (`barber_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `expenses_organization_date_idx` ON `expenses` (`organization_id`,`occurred_at`);