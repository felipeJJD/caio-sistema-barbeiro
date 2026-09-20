CREATE TABLE `assistant_profiles` (
  `organization_id` integer NOT NULL,
  `team_member_id` integer NOT NULL,
  `interaction_count` integer DEFAULT 0 NOT NULL,
  `detail_score` integer DEFAULT 55 NOT NULL,
  `warmth_score` integer DEFAULT 75 NOT NULL,
  `humor_score` integer DEFAULT 25 NOT NULL,
  `emoji_score` integer DEFAULT 10 NOT NULL,
  `initiative_score` integer DEFAULT 70 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(`organization_id`, `team_member_id`)
);
--> statement-breakpoint
CREATE INDEX `assistant_profiles_member_idx` ON `assistant_profiles` (`team_member_id`);