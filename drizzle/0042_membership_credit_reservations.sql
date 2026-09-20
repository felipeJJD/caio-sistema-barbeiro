ALTER TABLE `plans` ADD `service_id` integer;
ALTER TABLE `appointments` ADD `membership_plan_id` integer;
ALTER TABLE `appointments` ADD `membership_credit_state` text;
ALTER TABLE `daily_records` ADD `appointment_id` integer;

UPDATE `plans`
SET `service_id` = (
  SELECT `services`.`id`
  FROM `services`
  WHERE `services`.`organization_id` = `plans`.`organization_id`
    AND `services`.`deleted_at` IS NULL
    AND lower(trim(`services`.`name`)) = lower(trim(`plans`.`plan_kind`))
  LIMIT 1
)
WHERE `service_id` IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `daily_records_appointment_unique`
ON `daily_records` (`appointment_id`);

CREATE INDEX IF NOT EXISTS `appointments_membership_credit_idx`
ON `appointments` (`organization_id`, `membership_client_id`, `membership_credit_state`);
