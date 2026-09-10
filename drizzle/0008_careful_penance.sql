CREATE TABLE `app_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`recipient_team_member_id` integer NOT NULL,
	`actor_team_member_id` integer NOT NULL,
	`kind` text DEFAULT 'attendance' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`target` text DEFAULT '/?section=Historico' NOT NULL,
	`related_record_id` integer,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_notifications_record_recipient_unique` ON `app_notifications` (`kind`,`related_record_id`,`recipient_team_member_id`);--> statement-breakpoint
CREATE INDEX `app_notifications_recipient_idx` ON `app_notifications` (`organization_id`,`recipient_team_member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`team_member_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_recipient_idx` ON `push_subscriptions` (`organization_id`,`team_member_id`);