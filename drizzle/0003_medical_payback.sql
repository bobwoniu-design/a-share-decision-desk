CREATE TABLE `alert_events` (
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`bar_time` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `date`, `code`, `kind`)
);
