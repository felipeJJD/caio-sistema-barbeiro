ALTER TABLE `plans` ADD `service_id` integer;
ALTER TABLE `appointments` ADD `membership_plan_id` integer;
ALTER TABLE `appointments` ADD `membership_credit_state` text;
ALTER TABLE `daily_records` ADD `appointment_id` integer;


CREATE UNIQUE INDEX IF NOT EXISTS `daily_records_appointment_unique`
ON `daily_records` (`appointment_id`);

CREATE INDEX IF NOT EXISTS `appointments_membership_credit_idx`
ON `appointments` (`organization_id`, `membership_client_id`, `membership_credit_state`);
