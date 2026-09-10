CREATE TABLE `attendances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`barber_id` integer NOT NULL,
	`service` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`plan` text NOT NULL,
	`plan_kind` text NOT NULL,
	`balance` integer NOT NULL,
	`max_balance` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`monthly_value_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`commission_cents` integer NOT NULL
);
