import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const marketCache = sqliteTable("market_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
});
export const ledgers = sqliteTable("ledgers", {
  owner: text("owner").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
  mutation: text("mutation").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});
export const audit = sqliteTable(
  "audit",
  {
    owner: text("owner").notNull(),
    revision: integer("revision").notNull(),
    action: text("action").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.revision] })],
);
export const marketObservations = sqliteTable("market_observations",{
  date:text("date").notNull(),
  time:text("time").notNull(),
  score:integer("score"),
  phase:text("phase").notNull(),
  reason:text("reason").notNull(),
  capturedAt:text("captured_at").notNull(),
},(t)=>[primaryKey({columns:[t.date,t.time]})]);
