CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appointment_date` text NOT NULL,
	`appointment_time` text NOT NULL,
	`client_name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`service_id` integer NOT NULL,
	`barber_id` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Agendado' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`client_name` text NOT NULL,
	`barber_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`payment_method_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`value_cents` integer NOT NULL,
	`commission_rate_bps` integer NOT NULL,
	`commission_cents` integer NOT NULL,
	`tip_cents` integer DEFAULT 0 NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`origin` text DEFAULT 'Retorno' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`value_cents` integer NOT NULL,
	`paid` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`revenue_cents` integer DEFAULT 0 NOT NULL,
	`gross_profit_cents` integer DEFAULT 0 NOT NULL,
	`expense_cents` integer DEFAULT 0 NOT NULL,
	`net_profit_cents` integer DEFAULT 0 NOT NULL,
	`attendance_target` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`fee_bps` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `team` ADD `commission_rate_bps` integer DEFAULT 0 NOT NULL;