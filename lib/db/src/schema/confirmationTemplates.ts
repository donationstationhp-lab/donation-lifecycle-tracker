import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const confirmationTemplatesTable = pgTable("confirmation_templates", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertConfirmationTemplateSchema = createInsertSchema(
  confirmationTemplatesTable,
).omit({
  updatedAt: true,
});
export type InsertConfirmationTemplate = z.infer<typeof insertConfirmationTemplateSchema>;
export type ConfirmationTemplate = typeof confirmationTemplatesTable.$inferSelect;