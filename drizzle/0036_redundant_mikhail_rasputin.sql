CREATE TABLE `legacy_record_imports` (
	`source_system` text NOT NULL,
	`source_record_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`daily_record_id` integer NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_record_imports_source_unique` ON `legacy_record_imports` (`source_system`,`source_record_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_record_imports_target_unique` ON `legacy_record_imports` (`daily_record_id`);