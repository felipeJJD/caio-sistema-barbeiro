CREATE TABLE `subscription_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`created_by_team_member_id` integer NOT NULL,
	`provider` text DEFAULT 'mercado_pago' NOT NULL,
	`provider_payment_id` text,
	`external_reference` text NOT NULL,
	`kind` text DEFAULT 'pix_30_days' NOT NULL,
	`amount_cents` integer DEFAULT 499 NOT NULL,
	`period_days` integer DEFAULT 30 NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_detail` text DEFAULT '' NOT NULL,
	`qr_code` text,
	`qr_code_base64` text,
	`ticket_url` text,
	`expires_at` text,
	`paid_at` text,
	`access_until` text,
	`applied_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payments_provider_payment_unique` ON `subscription_payments` (`provider_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payments_external_reference_unique` ON `subscription_payments` (`external_reference`);--> statement-breakpoint
CREATE INDEX `subscription_payments_organization_created_idx` ON `subscription_payments` (`organization_id`,`created_at`);