CREATE TABLE `affiliate_mercado_pago_connections` (
	`affiliate_id` integer PRIMARY KEY NOT NULL,
	`provider_user_id` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`access_token_iv` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`refresh_token_iv` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `affiliate_mercado_pago_states` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`affiliate_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_mp_states_affiliate_idx` ON `affiliate_mercado_pago_states` (`affiliate_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_affiliates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`payout_provider` text DEFAULT 'mercado_pago' NOT NULL,
	`provider_recipient_id` text,
	`payout_status` text DEFAULT 'pending_setup' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_affiliates`("id", "name", "email", "whatsapp", "payout_provider", "provider_recipient_id", "payout_status", "active", "created_at", "updated_at") SELECT "id", "name", "email", "whatsapp", "payout_provider", "provider_recipient_id", "payout_status", "active", "created_at", "updated_at" FROM `affiliates`;--> statement-breakpoint
DROP TABLE `affiliates`;--> statement-breakpoint
ALTER TABLE `__new_affiliates` RENAME TO `affiliates`;--> statement-breakpoint
UPDATE `affiliates` SET `payout_provider` = 'mercado_pago' WHERE `payout_provider` = 'pagar_me';--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD `split_affiliate_id` integer;
