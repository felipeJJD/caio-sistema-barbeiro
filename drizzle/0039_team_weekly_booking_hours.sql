ALTER TABLE `team` ADD `weekly_booking_hours` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `team`
SET `weekly_booking_hours` = '[{"day":0,"enabled":false,"openingTime":"09:00","closingTime":"13:00"},{"day":1,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":2,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":3,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":4,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":5,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":6,"enabled":true,"openingTime":"08:00","closingTime":"19:30"}]'
WHERE `organization_id` IN (
  SELECT `id` FROM `organizations`
  WHERE `slug` = 'kaio-barbearia' OR lower(trim(`name`)) = 'kaio barbearia'
);
--> statement-breakpoint
UPDATE `team`
SET `weekly_booking_hours` = '[{"day":0,"enabled":true,"openingTime":"09:00","closingTime":"13:00"},{"day":1,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":2,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":3,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":4,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":5,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":6,"enabled":true,"openingTime":"08:00","closingTime":"19:30"}]'
WHERE `organization_id` IN (
  SELECT `id` FROM `organizations`
  WHERE `slug` = 'kaio-barbearia' OR lower(trim(`name`)) = 'kaio barbearia'
)
AND lower(trim(`name`)) = 'eduardo';
