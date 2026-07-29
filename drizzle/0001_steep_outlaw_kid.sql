ALTER TABLE `conversations` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `conversations_user_deleted_idx` ON `conversations` (`user_id`,`deleted_at`);