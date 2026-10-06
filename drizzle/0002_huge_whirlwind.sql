CREATE TABLE `market_observations` (
	`date` text NOT NULL,
	`time` text NOT NULL,
	`score` integer,
	`phase` text NOT NULL,
	`reason` text NOT NULL,
	`captured_at` text NOT NULL,
	PRIMARY KEY(`date`, `time`)
);
