ALTER TABLE `organizations` ADD `account_type` text DEFAULT 'barbershop' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_billing_settings` ADD `barber_pix_price_cents` integer DEFAULT 999 NOT NULL;
