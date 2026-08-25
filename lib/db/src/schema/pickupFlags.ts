import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pickupRequestsTable } from "./pickupRequests";

export const pickupFlagsTable = pgTable(
  "pickup_flags",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    value: text("value").notNull(),
    reason: text("reason").notNull(),
    pickupRequestId: text("pickup_request_id")
      .notNull()
      .references(() => pickupRequestsTable.id, { onDelete: "cascade" }),
    count: integer("count").notNull().default(1),
    supervisorApproved: boolean("supervisor_approved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    typeValueIndex: uniqueIndex("pickup_flags_type_value_idx").on(table.type, table.value),
  }),
);

export const insertPickupFlagSchema = createInsertSchema(pickupFlagsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPickupFlag = z.infer<typeof insertPickupFlagSchema>;
export type PickupFlag = typeof pickupFlagsTable.$inferSelect;