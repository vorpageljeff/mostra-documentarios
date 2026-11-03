CREATE TABLE `films` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`synopsis` text NOT NULL,
	`team` text NOT NULL,
	`category` text NOT NULL,
	`filename` text NOT NULL,
	`fingerprint` text NOT NULL,
	`size` integer NOT NULL,
	`duration` integer NOT NULL,
	`status` text NOT NULL,
	`objectKey` text NOT NULL,
	`uploadId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `film_status` ON `films` (`status`);--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parts` (
	`filmId` text NOT NULL,
	`partNumber` integer NOT NULL,
	`etag` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`filmId`, `partNumber`),
	FOREIGN KEY (`filmId`) REFERENCES `films`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`filmId` text NOT NULL,
	`userId` text NOT NULL,
	`score` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`filmId`, `userId`),
	FOREIGN KEY (`filmId`) REFERENCES `films`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);