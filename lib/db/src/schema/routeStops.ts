import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { deliveryRoutesTable } from "./deliveryRoutes";
import { donationItemsTable } from "./donationItems";

export const routeStopsTable = pgTable("route_stops", {
  id: text("id").primaryKey(),
  routeId: text("route_id")
    .notNull()
    .references(() => deliveryRoutesTable.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => donationItemsTable.id, { onDelete: "cascade" }),
  stopOrder: integer("stop_order").notNull(),
  notes: text("notes"),
});

export const insertRouteStopSchema = createInsertSchema(routeStopsTable);
export type InsertRouteStop = z.infer<typeof insertRouteStopSchema>;
export type RouteStop = typeof routeStopsTable.$inferSelect;
