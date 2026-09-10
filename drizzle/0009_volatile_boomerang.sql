CREATE TABLE `product_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`seller_team_member_id` integer NOT NULL,
	`payment_method_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_sales_organization_date_idx` ON `product_sales` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `product_sales_seller_date_idx` ON `product_sales` (`seller_team_member_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `shop_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Geral' NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`price_cents` integer NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 2 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shop_products_organization_name_idx` ON `shop_products` (`organization_id`,`name`);