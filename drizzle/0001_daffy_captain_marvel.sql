CREATE TABLE `daily_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kst_date` text NOT NULL,
	`value` real NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_entries_user_date` ON `daily_entries` (`user_id`,`kst_date`);--> statement-breakpoint
CREATE TABLE `daily_rule_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`before_rule` text NOT NULL,
	`after_rule` text NOT NULL,
	`reason` text NOT NULL,
	`day1_id` text NOT NULL,
	`day2_id` text NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`day1_id`) REFERENCES `daily_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`day2_id`) REFERENCES `daily_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_rule_changes_user_unique` ON `daily_rule_changes` (`user_id`);--> statement-breakpoint
CREATE TABLE `daily_specs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`metric` text NOT NULL,
	`unit` text NOT NULL,
	`calculation_rule` text NOT NULL,
	`missing_rule` text NOT NULL,
	`duplicate_rule` text NOT NULL,
	`outlier_rule` text NOT NULL,
	`rounding_rule` text NOT NULL,
	`week_start` text NOT NULL,
	`plan_rule` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `plans` ADD `owner_id` text REFERENCES users(id);