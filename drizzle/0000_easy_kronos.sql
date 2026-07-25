CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`book_id` text NOT NULL,
	`kind` text NOT NULL,
	`quote` text,
	`content` text,
	`location` text,
	`color` text DEFAULT 'orange' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `annotations_book_idx` ON `annotations` (`device_id`,`book_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '未知作者' NOT NULL,
	`format` text NOT NULL,
	`category` text DEFAULT '未分类' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`current_location` text,
	`file_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `books_owner_updated_idx` ON `books` (`device_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`device_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`book_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`words_read` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_sessions_owner_time_idx` ON `reading_sessions` (`device_id`,`started_at`);