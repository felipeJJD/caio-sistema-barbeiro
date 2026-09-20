ALTER TABLE `whatsapp_connections` ADD `onboarding_mode` text DEFAULT 'cloud' NOT NULL;
ALTER TABLE `whatsapp_connections` ADD `verified_name` text DEFAULT '' NOT NULL;
ALTER TABLE `whatsapp_connections` ADD `token_expires_at` text;
ALTER TABLE `whatsapp_connections` ADD `encrypted_registration_pin` text DEFAULT '' NOT NULL;
ALTER TABLE `whatsapp_connections` ADD `registration_pin_iv` text DEFAULT '' NOT NULL;
ALTER TABLE `whatsapp_connections` ADD `webhook_subscribed_at` text;
ALTER TABLE `whatsapp_connections` ADD `registered_at` text;
