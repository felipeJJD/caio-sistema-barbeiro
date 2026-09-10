ALTER TABLE `organizations` ADD `use_service_duration_in_agenda` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `opening_time` text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `closing_time` text DEFAULT '19:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `duration_minutes` integer DEFAULT 30 NOT NULL;