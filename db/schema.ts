import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull().default("未知作者"),
  format: text("format").notNull(),
  category: text("category").notNull().default("未分类"),
  progress: integer("progress").notNull().default(0),
  currentLocation: text("current_location"),
  fileKey: text("file_key"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => ({
  ownerUpdatedIdx: index("books_owner_updated_idx").on(table.deviceId, table.updatedAt),
}));

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  bookId: text("book_id").notNull(),
  kind: text("kind").notNull(),
  quote: text("quote"),
  content: text("content"),
  location: text("location"),
  color: text("color").notNull().default("orange"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => ({
  bookIdx: index("annotations_book_idx").on(table.deviceId, table.bookId, table.updatedAt),
}));

export const readingSessions = sqliteTable("reading_sessions", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  bookId: text("book_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  wordsRead: integer("words_read").notNull().default(0),
}, table => ({
  ownerTimeIdx: index("reading_sessions_owner_time_idx").on(table.deviceId, table.startedAt),
}));

export const preferences = sqliteTable("preferences", {
  deviceId: text("device_id").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
