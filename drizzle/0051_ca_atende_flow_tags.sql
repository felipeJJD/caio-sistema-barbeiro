CREATE TABLE `ca_atende_flow_tags` (
	`organization_id` integer NOT NULL,
	`phone` text NOT NULL,
	`started_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `phone`)
);
--> statement-breakpoint
CREATE INDEX `ca_atende_flow_tags_expires_idx` ON `ca_atende_flow_tags` (`expires_at`);
