import { and, asc, desc, eq, ilike, inArray, like, or } from "drizzle-orm";
import { db, donationItemsTable } from "@workspace/db";
import type { DonationItem, InsertDonationItem } from "@workspace/db";

export type ItemListCriteria = {
  ids?: string[];
  stage?: string;
  tier?: string;
  category?: string;
  temperatureZone?: string;
  pendingReview?: boolean;
  search?: string;
  donorId?: string;
  recipient?: string;
  sourcePickupId?: string;
};

export type ItemListOptions = {
  order?: "createdAtDesc" | "createdAtAsc" | "expiryDateAsc";
  forUpdate?: boolean;
};

export type ItemResource = Pick<DonationItem, "name" | "category" | "condition">;
export type ItemWorkflowSummary = Pick<DonationItem, "id" | "itemId" | "name" | "stage">;
export type PublicTrackingItem = Pick<DonationItem, "name" | "category" | "stage">;
export type ItemSearchResult = { id: string; label: string; detail: string };
export type ItemImpact = Pick<DonationItem, "category" | "stage">;
export type ItemGiftDate = Pick<DonationItem, "donorId" | "createdAt">;

/**
 * Storage-neutral item operations used by routes.  The generic transaction
 * binding deliberately does not expose a database or query-builder type:
 * alternate implementations can bind their own transaction handle.
 */
export interface ItemRepository {
  forTransaction<TTransaction>(transaction: TTransaction): ItemRepository;
  list(criteria?: ItemListCriteria, options?: ItemListOptions): Promise<DonationItem[]>;
  getById(id: string, options?: { forUpdate?: boolean }): Promise<DonationItem | undefined>;
  findByIds(ids: string[]): Promise<DonationItem[]>;
  findBySourcePickupId(sourcePickupId: string): Promise<DonationItem | undefined>;
  findByRecipient(recipient: string): Promise<DonationItem | undefined>;
  listByDonorId(donorId: string): Promise<DonationItem[]>;
  listGiftDates(): Promise<ItemGiftDate[]>;
  existsById(id: string): Promise<boolean>;
  listAvailableResources(): Promise<ItemResource[]>;
  searchResults(search: string, limit: number): Promise<ItemSearchResult[]>;
  listWorkflowSummary(id: string): Promise<ItemWorkflowSummary | undefined>;
  getPublicTrackingItem(id: string): Promise<PublicTrackingItem | undefined>;
  listImpactItems(): Promise<ItemImpact[]>;
  insert(values: InsertDonationItem): Promise<DonationItem>;
  upsertImported(values: InsertDonationItem, now: Date): Promise<void>;
  updateById(
    id: string,
    updates: Partial<InsertDonationItem> & { updatedAt?: Date },
  ): Promise<DonationItem | undefined>;
  updateStage(
    id: string,
    fromStage: string,
    toStage: string,
    updates?: Partial<InsertDonationItem> & { updatedAt?: Date },
  ): Promise<DonationItem | undefined>;
  deleteById(id: string): Promise<DonationItem | undefined>;
}

type ItemTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ItemExecutor = typeof db | ItemTransaction;

function conditionsFor(criteria: ItemListCriteria) {
  const conditions = [];
  if (criteria.ids) conditions.push(inArray(donationItemsTable.id, criteria.ids));
  if (criteria.stage) conditions.push(eq(donationItemsTable.stage, criteria.stage));
  if (criteria.tier) conditions.push(eq(donationItemsTable.tier, criteria.tier));
  if (criteria.category) conditions.push(eq(donationItemsTable.category, criteria.category));
  if (criteria.temperatureZone) {
    conditions.push(eq(donationItemsTable.temperatureZone, criteria.temperatureZone));
  }
  if (criteria.pendingReview !== undefined) {
    conditions.push(eq(donationItemsTable.pendingReview, criteria.pendingReview));
  }
  if (criteria.search) conditions.push(like(donationItemsTable.name, `%${criteria.search}%`));
  if (criteria.donorId) conditions.push(eq(donationItemsTable.donorId, criteria.donorId));
  if (criteria.recipient) conditions.push(eq(donationItemsTable.recipient, criteria.recipient));
  if (criteria.sourcePickupId) {
    conditions.push(eq(donationItemsTable.sourcePickupId, criteria.sourcePickupId));
  }
  return conditions;
}

function createItemRepository(executor: ItemExecutor): ItemRepository {
  return {
    forTransaction<TTransaction>(transaction: TTransaction): ItemRepository {
      return createItemRepository(transaction as ItemExecutor);
    },

    async list(criteria = {}, options = {}) {
      const conditions = conditionsFor(criteria);
      const query = executor
        .select()
        .from(donationItemsTable)
        .where(conditions.length ? and(...conditions) : undefined);
      if (options.order === "createdAtDesc") {
        const ordered = query.orderBy(desc(donationItemsTable.createdAt));
        return options.forUpdate ? ordered.for("update") : ordered;
      }
      if (options.order === "createdAtAsc") {
        const ordered = query.orderBy(asc(donationItemsTable.createdAt));
        return options.forUpdate ? ordered.for("update") : ordered;
      }
      if (options.order === "expiryDateAsc") {
        const ordered = query.orderBy(asc(donationItemsTable.expiryDate));
        return options.forUpdate ? ordered.for("update") : ordered;
      }
      return options.forUpdate ? query.for("update") : query;
    },

    async getById(id, options = {}) {
      const query = executor
        .select()
        .from(donationItemsTable)
        .where(eq(donationItemsTable.id, id));
      if (options.forUpdate) {
        const locked = query.for("update");
        const [item] = await locked;
        return item;
      }
      const [item] = await query;
      return item;
    },

    async findByIds(ids) {
      return ids.length ? this.list({ ids }) : [];
    },

    async findBySourcePickupId(sourcePickupId) {
      const [item] = await this.list({ sourcePickupId });
      return item;
    },

    async findByRecipient(recipient) {
      const [item] = await this.list({ recipient });
      return item;
    },

    async listByDonorId(donorId) {
      return this.list({ donorId }, { order: "createdAtAsc" });
    },

    async listGiftDates() {
      return executor.select({
        donorId: donationItemsTable.donorId,
        createdAt: donationItemsTable.createdAt,
      }).from(donationItemsTable);
    },

    async existsById(id) {
      const [item] = await executor
        .select({ id: donationItemsTable.id })
        .from(donationItemsTable)
        .where(eq(donationItemsTable.id, id))
        .limit(1);
      return item !== undefined;
    },

    async listAvailableResources() {
      return executor
        .select({
          name: donationItemsTable.name,
          category: donationItemsTable.category,
          condition: donationItemsTable.condition,
        })
        .from(donationItemsTable)
        .where(and(
          eq(donationItemsTable.stage, "storage"),
          eq(donationItemsTable.pendingReview, false),
        ))
        .orderBy(asc(donationItemsTable.category), asc(donationItemsTable.name));
    },

    async searchResults(search, limit) {
      const pattern = `%${search}%`;
      return executor
        .select({
          id: donationItemsTable.id,
          label: donationItemsTable.name,
          detail: donationItemsTable.itemId,
        })
        .from(donationItemsTable)
        .where(search
          ? or(
              ilike(donationItemsTable.id, pattern),
              ilike(donationItemsTable.name, pattern),
              ilike(donationItemsTable.itemId, pattern),
            )
          : undefined)
        .orderBy(desc(donationItemsTable.createdAt))
        .limit(limit);
    },

    async listWorkflowSummary(id) {
      const [item] = await executor
        .select({
          id: donationItemsTable.id,
          itemId: donationItemsTable.itemId,
          name: donationItemsTable.name,
          stage: donationItemsTable.stage,
        })
        .from(donationItemsTable)
        .where(eq(donationItemsTable.id, id));
      return item;
    },

    async getPublicTrackingItem(id) {
      const [item] = await executor
        .select({
          name: donationItemsTable.name,
          category: donationItemsTable.category,
          stage: donationItemsTable.stage,
        })
        .from(donationItemsTable)
        .where(eq(donationItemsTable.id, id));
      return item;
    },

    async listImpactItems() {
      return executor
        .select({
          category: donationItemsTable.category,
          stage: donationItemsTable.stage,
        })
        .from(donationItemsTable);
    },

    async insert(values) {
      const [item] = await executor.insert(donationItemsTable).values(values).returning();
      return item;
    },

    async upsertImported(values, now) {
      await executor
        .insert(donationItemsTable)
        .values(values)
        .onConflictDoUpdate({
          target: donationItemsTable.id,
          set: {
            itemId: values.itemId,
            name: values.name,
            category: values.category,
            tier: values.tier,
            condition: values.condition,
            donor: values.donor,
            recipient: values.recipient,
            location: values.location,
            expiryDate: values.expiryDate,
            temperatureZone: values.temperatureZone,
            weight: values.weight,
            origin: values.origin,
            lotNumber: values.lotNumber,
            powerConnectionReading: values.powerConnectionReading,
            pendingReview: values.pendingReview,
            updatedAt: now,
          },
        });
    },

    async updateById(id, updates) {
      const [item] = await executor
        .update(donationItemsTable)
        .set(updates)
        .where(eq(donationItemsTable.id, id))
        .returning();
      return item;
    },

    async updateStage(id, fromStage, toStage, updates = {}) {
      const [item] = await executor
        .update(donationItemsTable)
        .set({ ...updates, stage: toStage })
        .where(and(
          eq(donationItemsTable.id, id),
          eq(donationItemsTable.stage, fromStage),
        ))
        .returning();
      return item;
    },

    async deleteById(id) {
      const [item] = await executor
        .delete(donationItemsTable)
        .where(eq(donationItemsTable.id, id))
        .returning();
      return item;
    },
  };
}

export const itemRepository = createItemRepository(db);