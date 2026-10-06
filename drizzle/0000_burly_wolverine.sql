CREATE TABLE `audit` (
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mutation` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
