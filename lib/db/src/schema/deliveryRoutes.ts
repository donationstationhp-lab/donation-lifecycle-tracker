import { pgTable, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deliveryRoutesTable = pgTable("delivery_routes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("planned"), // planned | in_progress | completed
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDeliveryRouteSchema = createInsertSchema(deliveryRoutesTable).omit({
  createdAt: true,
});
export type InsertDeliveryRoute = z.infer<typeof insertDeliveryRouteSchema>;
export type DeliveryRoute = typeof deliveryRoutesTable.$inferSelect;
