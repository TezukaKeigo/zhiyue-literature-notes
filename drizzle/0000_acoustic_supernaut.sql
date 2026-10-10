CREATE TABLE `literature_tags` (
	`literature_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`literature_id`, `tag_id`),
	FOREIGN KEY (`literature_id`) REFERENCES `literatures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `literature_tags_tag_idx` ON `literature_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `literatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`authors` text NOT NULL,
	`year` integer,
	`journal` text DEFAULT '' NOT NULL,
	`doi` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`abstract` text DEFAULT '' NOT NULL,
	`reading_status` text DEFAULT 'TO_READ' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `literatures_user_status_idx` ON `literatures` (`user_id`,`reading_status`);--> statement-breakpoint
CREATE INDEX `literatures_user_year_idx` ON `literatures` (`user_id`,`year`);--> statement-breakpoint
CREATE TABLE `reading_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`literature_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`page_ref` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`literature_id`) REFERENCES `literatures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_notes_literature_idx` ON `reading_notes` (`literature_id`);--> statement-breakpoint
CREATE INDEX `reading_notes_user_idx` ON `reading_notes` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#315c63' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_name_unique` ON `tags` (`user_id`,`name`);