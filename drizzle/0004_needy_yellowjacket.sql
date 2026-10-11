CREATE TABLE `selection_days` (
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `date`)
);
