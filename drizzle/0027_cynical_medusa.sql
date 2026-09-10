ALTER TABLE `appointments` ADD `payment_choice` text DEFAULT 'Dinheiro' NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `payment_confirmation_token` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `booking_pix_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `booking_pix_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `booking_cash_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `booking_debit_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `booking_credit_enabled` integer DEFAULT true NOT NULL;