CREATE TABLE `literature_ai_outputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`literature_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`key_points_json` text DEFAULT '[]' NOT NULL,
	`input_hash` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`literature_id`) REFERENCES `literatures`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "literature_ai_outputs_kind_check" CHECK("literature_ai_outputs"."kind" in ('PAPER_ANALYSIS', 'READING_SUMMARY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `literature_ai_outputs_literature_kind_unique` ON `literature_ai_outputs` (`literature_id`,`kind`);--> statement-breakpoint
CREATE INDEX `literature_ai_outputs_user_idx` ON `literature_ai_outputs` (`user_id`);