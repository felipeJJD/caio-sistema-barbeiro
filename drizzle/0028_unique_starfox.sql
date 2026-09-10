CREATE TABLE `affiliate_commissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`affiliate_link_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`subscription_payment_id` integer NOT NULL,
	`rate_bps` integer NOT NULL,
	`gross_amount_cents` integer NOT NULL,
	`commission_amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending_payout_setup' NOT NULL,
	`provider_transfer_id` text,
	`available_at` text NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_commissions_payment_unique` ON `affiliate_commissions` (`subscription_payment_id`);--> statement-breakpoint
CREATE INDEX `affiliate_commissions_affiliate_status_idx` ON `affiliate_commissions` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE TABLE `affiliate_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`affiliate_id` integer NOT NULL,
	`code` text NOT NULL,
	`commission_bps` integer NOT NULL,
	`commission_months` integer DEFAULT 12 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by_team_member_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_links_code_unique` ON `affiliate_links` (`code`);--> statement-breakpoint
CREATE INDEX `affiliate_links_affiliate_idx` ON `affiliate_links` (`affiliate_id`);--> statement-breakpoint
CREATE TABLE `affiliates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`payout_provider` text DEFAULT 'pagar_me' NOT NULL,
	`provider_recipient_id` text,
	`payout_status` text DEFAULT 'pending_setup' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization_referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`affiliate_link_id` integer NOT NULL,
	`attributed_at` text NOT NULL,
	`commission_ends_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_referrals_organization_unique` ON `organization_referrals` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_referrals_link_idx` ON `organization_referrals` (`affiliate_link_id`);
