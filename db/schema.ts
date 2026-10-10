import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const literatures = sqliteTable(
  "literatures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    authors: text("authors").notNull(),
    year: integer("year"),
    journal: text("journal").notNull().default(""),
    doi: text("doi").notNull().default(""),
    url: text("url").notNull().default(""),
    abstract: text("abstract").notNull().default(""),
    readingStatus: text("reading_status").notNull().default("TO_READ"),
    rating: integer("rating").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("literatures_user_status_idx").on(table.userId, table.readingStatus),
    index("literatures_user_year_idx").on(table.userId, table.year),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#315c63"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("tags_user_name_unique").on(table.userId, table.name)],
);

export const literatureTags = sqliteTable(
  "literature_tags",
  {
    literatureId: integer("literature_id")
      .notNull()
      .references(() => literatures.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.literatureId, table.tagId] }),
    index("literature_tags_tag_idx").on(table.tagId),
  ],
);

export const notes = sqliteTable(
  "reading_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    literatureId: integer("literature_id")
      .notNull()
      .references(() => literatures.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    content: text("content").notNull(),
    pageRef: text("page_ref").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("reading_notes_literature_idx").on(table.literatureId),
    index("reading_notes_user_idx").on(table.userId),
  ],
);
