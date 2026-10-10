ALTER TABLE plans ADD COLUMN unlimited_uses integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN unlimited_uses integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE membership_payments ADD COLUMN unlimited_uses integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE membership_payments ADD COLUMN max_uses integer;
