import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const userAccounts = sqliteTable(
  "user_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    bootstrapSlot: integer("bootstrap_slot"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("user_accounts_email_unique").on(table.email),
    uniqueIndex("user_accounts_bootstrap_slot_unique").on(table.bootstrapSlot),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

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
