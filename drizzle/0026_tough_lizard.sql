CREATE TABLE `public_gallery_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`kind` text NOT NULL,
	`team_member_id` integer,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`alt_text` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_gallery_images_object_key_unique` ON `public_gallery_images` (`object_key`);--> statement-breakpoint
CREATE INDEX `public_gallery_images_org_kind_position_idx` ON `public_gallery_images` (`organization_id`,`kind`,`position`);--> statement-breakpoint
CREATE INDEX `public_gallery_images_team_idx` ON `public_gallery_images` (`organization_id`,`team_member_id`);