ALTER TABLE `product_sales` ADD `daily_record_id` integer;--> statement-breakpoint
ALTER TABLE `product_sales` ADD `client_name` text DEFAULT 'Cliente não informado' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_sales` ADD `commission_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_sales` ADD `commission_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `product_sales_daily_record_idx` ON `product_sales` (`daily_record_id`);--> statement-breakpoint
ALTER TABLE `shop_products` ADD `commission_rate_bps` integer DEFAULT 0 NOT NULL;