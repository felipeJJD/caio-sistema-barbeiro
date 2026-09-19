ALTER TABLE `team` ADD `payment_day` integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
CREATE TABLE `team_payment_closures` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `team_member_id` integer NOT NULL,
  `team_member_name` text NOT NULL,
  `period_start_date` text NOT NULL,
  `period_end_date` text NOT NULL,
  `closed_at` text NOT NULL,
  `payment_day` integer DEFAULT 10 NOT NULL,
  `earned_cents` integer DEFAULT 0 NOT NULL,
  `tip_cents` integer DEFAULT 0 NOT NULL,
  `vale_cents` integer DEFAULT 0 NOT NULL,
  `paid_cents` integer DEFAULT 0 NOT NULL,
  `settlement_cents` integer DEFAULT 0 NOT NULL,
  `record_count` integer DEFAULT 0 NOT NULL,
  `last_daily_record_id` integer DEFAULT 0 NOT NULL,
  `last_product_sale_id` integer DEFAULT 0 NOT NULL,
  `last_team_payment_id` integer DEFAULT 0 NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_by_team_member_id` integer NOT NULL,
  `is_baseline` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_payment_closures_org_member_closed_idx` ON `team_payment_closures` (`organization_id`, `team_member_id`, `closed_at`);
--> statement-breakpoint
CREATE INDEX `team_payment_closures_member_closed_idx` ON `team_payment_closures` (`team_member_id`, `closed_at`);
--> statement-breakpoint
INSERT INTO `team_payment_closures` (
  `organization_id`, `team_member_id`, `team_member_name`,
  `period_start_date`, `period_end_date`, `closed_at`, `payment_day`,
  `earned_cents`, `tip_cents`, `vale_cents`, `paid_cents`, `settlement_cents`, `record_count`,
  `last_daily_record_id`, `last_product_sale_id`, `last_team_payment_id`,
  `snapshot_json`, `created_by_team_member_id`, `is_baseline`
)
SELECT
  p.`organization_id`,
  p.`team_member_id`,
  p.`team_member_name`,
  p.`occurred_at`,
  p.`occurred_at`,
  COALESCE(p.`created_at`, p.`occurred_at` || ' 23:59:59'),
  COALESCE(t.`payment_day`, 10),
  0, 0, 0, 0, 0, 0,
  COALESCE((
    SELECT MAX(d.`id`) FROM `daily_records` d
    WHERE d.`organization_id` = p.`organization_id`
      AND d.`barber_id` = p.`team_member_id`
      AND d.`occurred_at` <= p.`occurred_at`
  ), 0),
  COALESCE((
    SELECT MAX(ps.`id`) FROM `product_sales` ps
    WHERE ps.`organization_id` = p.`organization_id`
      AND ps.`seller_team_member_id` = p.`team_member_id`
      AND ps.`occurred_at` <= p.`occurred_at`
  ), 0),
  p.`id`,
  '{"version":1,"baseline":true,"records":[],"productSales":[],"entries":[]}',
  COALESCE((
    SELECT MIN(owner.`id`) FROM `team` owner
    WHERE owner.`organization_id` = p.`organization_id`
      AND owner.`access_role` = 'owner'
  ), p.`team_member_id`),
  true
FROM `team_payments` p
INNER JOIN `team` t ON t.`id` = p.`team_member_id` AND t.`organization_id` = p.`organization_id`
WHERE p.`kind` = 'Pagamento'
  AND t.`access_role` <> 'owner'
  AND p.`id` = (
    SELECT MAX(p2.`id`) FROM `team_payments` p2
    WHERE p2.`organization_id` = p.`organization_id`
      AND p2.`team_member_id` = p.`team_member_id`
      AND p2.`kind` = 'Pagamento'
  );
