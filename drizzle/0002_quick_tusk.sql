CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`plan_kind` text NOT NULL,
	`monthly_value_cents` integer NOT NULL,
	`max_uses` integer DEFAULT 4 NOT NULL,
	`barber_payout_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `plan_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `paid_month` text DEFAULT '2026-08' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_records` ADD `record_type` text DEFAULT 'Avulso' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_records` ADD `membership_client_id` integer;--> statement-breakpoint
ALTER TABLE `team` ADD `active` integer DEFAULT true NOT NULL;