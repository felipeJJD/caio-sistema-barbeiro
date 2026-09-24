CREATE TABLE `affiliate_referral_archives` (
	`referral_id` integer PRIMARY KEY NOT NULL,
	`affiliate_id` integer NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_referral_archives_affiliate_idx` ON `affiliate_referral_archives` (`affiliate_id`);
