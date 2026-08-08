import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { donationItemsTable } from "./donationItems";

export const stageHistoryTable = pgTable("stage_history", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => donationItemsTable.id, { onDelete: "cascade" }),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  notes: text("notes"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStageHistorySchema = createInsertSchema(stageHistoryTable).omit({
  timestamp: true,
});
export type InsertStageHistory = z.infer<typeof insertStageHistorySchema>;
export type StageHistory = typeof stageHistoryTable.$inferSelect;
