import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  password: text().notNull(),
  createdAt: integer().notNull(),
});
export const sessions = sqliteTable("sessions", {
  token: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id),
  expiresAt: integer().notNull(),
});
export const films = sqliteTable(
  "films",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    synopsis: text().notNull(),
    team: text().notNull(),
    category: text().notNull(),
    filename: text().notNull(),
    fingerprint: text().notNull(),
    size: integer().notNull(),
    duration: integer().notNull(),
    status: text().notNull(),
    objectKey: text().notNull(),
    uploadId: text().notNull(),
    createdAt: integer().notNull(),
  },
  (t) => [index("film_status").on(t.status)],
);
export const parts = sqliteTable(
  "parts",
  {
    filmId: text()
      .notNull()
      .references(() => films.id),
    partNumber: integer().notNull(),
    etag: text().notNull(),
    size: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.filmId, t.partNumber] })],
);
export const ratings = sqliteTable(
  "ratings",
  {
    filmId: text()
      .notNull()
      .references(() => films.id),
    userId: text()
      .notNull()
      .references(() => users.id),
    score: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.filmId, t.userId] })],
);
export const limits = sqliteTable("limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expiresAt: integer().notNull(),
});
