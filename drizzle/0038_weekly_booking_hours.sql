ALTER TABLE `organizations` ADD `weekly_booking_hours` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `organizations`
SET
  `opening_time` = '08:00',
  `closing_time` = '19:30',
  `public_booking_weekdays` = '0,1,2,3,4,5,6',
  `weekly_booking_hours` = '[{"day":0,"enabled":true,"openingTime":"09:00","closingTime":"13:00"},{"day":1,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":2,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":3,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":4,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":5,"enabled":true,"openingTime":"08:00","closingTime":"19:30"},{"day":6,"enabled":true,"openingTime":"08:00","closingTime":"19:30"}]'
WHERE `slug` = 'kaio-barbearia' OR lower(trim(`name`)) = 'kaio barbearia';
