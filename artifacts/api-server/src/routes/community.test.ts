import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import test from "node:test";
import { inArray } from "drizzle-orm";
import {
  appointmentHistoryTable,
  appointmentsTable,
  claimHistoryTable,
  claimsTable,
  communityOwnershipTable,
  db,
  donationItemsTable,
  locationsTable,
  pool,
  recipientAccountsTable,
  serviceActivitiesTable,
} from "@workspace/db";
import communityRouter from "./community";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const runId = randomUUID();
  const locationId = `community-location-${runId}`;
  const users = ["one", "two"].map((suffix) => ({
    clerkUserId: `clerk-community-${suffix}-${runId}`,
    accountId: `community-account-${suffix}-${runId}`,
    itemId: `community-item-${suffix}-${runId}`,
    claimId: `community-claim-${suffix}-${runId}`,
    reservationId: `community-reservation-${suffix}-${runId}`,
    volunteerId: `community-volunteer-${suffix}-${runId}`,
    acknowledgmentId: `community-ack-${suffix}-${runId}`,
    trackingCode: `DSC-${suffix}-${runId}`,
    sensitive: {
      contactName: `Private contact ${suffix} ${runId}`,
      contactEmail: `private-${suffix}-${runId}@example.test`,
      contactPhone: `555-${suffix}-${runId}`,
      address: `Private address ${suffix} ${runId}`,
      staffId: `staff-private-${suffix}-${runId}`,
      staffNotes: `Staff-only notes ${suffix} ${runId}`,
    },
  }));

  await db.insert(locationsTable).values({
    id: locationId,
    code: `COMM-${runId}`,
    zone: "community-test",
    description: `Private location address ${runId}`,
  });

  for (const user of users) {
    await db.insert(recipientAccountsTable).values({
      id: user.accountId,
      name: `Community account ${runId}`,
      type: "individual",
      contactName: user.sensitive.contactName,
      contactEmail: user.sensitive.contactEmail,
      contactPhone: user.sensitive.contactPhone,
    });
    await db.insert(donationItemsTable).values({
      id: user.itemId,
      itemId: `DS-${randomUUID()}`,
      name: `Owned item ${user.clerkUserId}`,
      category: "equipment",
      tier: "R",
      condition: "good",
      donor: `Private donor ${runId}`,
      recipient: user.sensitive.contactName,
      location: user.sensitive.address,
      lotNumber: `LOT-${randomUUID()}`,
      powerConnectionReading: user.sensitive.staffNotes,
    });
    await db.insert(claimsTable).values({
      id: user.claimId,
      trackingCode: user.trackingCode,
      accountId: user.accountId,
      itemId: user.itemId,
      status: "approved",
      submittedBy: user.sensitive.contactName,
      approvedBy: user.sensitive.staffId,
      notes: user.sensitive.staffNotes,
    });
    await db.insert(claimHistoryTable).values({
      id: randomUUID(),
      claimId: user.claimId,
      fromStatus: "submitted",
      toStatus: "approved",
      by: user.sensitive.staffId,
      notes: user.sensitive.staffNotes,
    });
    await db.insert(appointmentsTable).values([
      {
        id: user.reservationId,
        appointmentType: "reserve_item_pickup",
        accountId: user.accountId,
        relatedClaimId: user.claimId,
        relatedItemId: user.itemId,
        locationId,
        scheduledStart: new Date("2026-09-20T12:00:00.000Z"),
        scheduledEnd: new Date("2026-09-20T13:00:00.000Z"),
        status: "confirmed",
        staffAssigned: user.sensitive.staffId,
        contactName: user.sensitive.contactName,
        contactEmail: user.sensitive.contactEmail,
        contactPhone: user.sensitive.contactPhone,
        pickupAddress: user.sensitive.address,
        internalNotes: user.sensitive.staffNotes,
      },
      {
        id: user.volunteerId,
        appointmentType: "volunteer_shift",
        accountId: user.accountId,
        locationId,
        scheduledStart: new Date("2026-09-21T12:00:00.000Z"),
        scheduledEnd: new Date("2026-09-21T14:00:00.000Z"),
        status: "requested",
        staffAssigned: user.sensitive.staffId,
        contactName: user.sensitive.contactName,
        contactEmail: user.sensitive.contactEmail,
        contactPhone: user.sensitive.contactPhone,
        pickupAddress: user.sensitive.address,
        internalNotes: user.sensitive.staffNotes,
      },
    ]);
    await db.insert(appointmentHistoryTable).values([
      {
        id: randomUUID(),
        appointmentId: user.reservationId,
        fromStatus: "requested",
        toStatus: "confirmed",
        by: user.sensitive.staffId,
        notes: user.sensitive.staffNotes,
      },
      {
        id: randomUUID(),
        appointmentId: user.volunteerId,
        fromStatus: null,
        toStatus: "requested",
        by: user.sensitive.staffId,
        notes: user.sensitive.staffNotes,
      },
    ]);
    await db.insert(serviceActivitiesTable).values({
      id: user.acknowledgmentId,
      activityType: "acknowledgment",
      loopStage: "complete",
      relatedAccountId: user.accountId,
      status: "completed",
      staffOwner: user.sensitive.staffId,
      publicSafeSummary: `Acknowledged request for ${user.clerkUserId}`,
      internalNotes: user.sensitive.staffNotes,
      idempotencyKey: `community-test-${user.clerkUserId}`,
    });
    await db.insert(communityOwnershipTable).values([
      {
        id: randomUUID(),
        clerkUserId: user.clerkUserId,
        recordType: "account",
        recordId: user.accountId,
        verifiedBy: user.sensitive.staffId,
      },
      {
        id: randomUUID(),
        clerkUserId: user.clerkUserId,
        recordType: "appointment",
        recordId: user.volunteerId,
        verifiedBy: user.sensitive.staffId,
      },
    ]);
  }

  return { locationId, users };
}

async function cleanupFixture(fixture: Fixture) {
  const accountIds = fixture.users.map((user) => user.accountId);
  const itemIds = fixture.users.map((user) => user.itemId);
  const claimIds = fixture.users.map((user) => user.claimId);
  const appointmentIds = fixture.users.flatMap((user) => [user.reservationId, user.volunteerId]);
  const activityIds = fixture.users.map((user) => user.acknowledgmentId);

  await db.delete(communityOwnershipTable).where(
    inArray(communityOwnershipTable.clerkUserId, fixture.users.map((user) => user.clerkUserId)),
  );
  await db.delete(serviceActivitiesTable).where(inArray(serviceActivitiesTable.id, activityIds));
  await db.delete(appointmentHistoryTable).where(
    inArray(appointmentHistoryTable.appointmentId, appointmentIds),
  );
  await db.delete(appointmentsTable).where(inArray(appointmentsTable.id, appointmentIds));
  await db.delete(claimHistoryTable).where(inArray(claimHistoryTable.claimId, claimIds));
  await db.delete(claimsTable).where(inArray(claimsTable.id, claimIds));
  await db.delete(donationItemsTable).where(inArray(donationItemsTable.id, itemIds));
  await db.delete(recipientAccountsTable).where(inArray(recipientAccountsTable.id, accountIds));
  await db.delete(locationsTable).where(inArray(locationsTable.id, [fixture.locationId]));
}

function createApp() {
  const app = express();
  app.use((req, res, next) => {
    const clerkUserId = req.header("x-test-clerk-user-id");
    if (clerkUserId) {
      res.locals.userRole = "community";
      res.locals.communityUserId = clerkUserId;
      res.locals.authMethod = "clerk";
    }
    next();
  });
  app.use(communityRouter);
  return app;
}

async function startTestServer() {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test("community history is isolated by Clerk identity and omits operational fields", async () => {
  const fixture = await createFixture();
  const server = await startTestServer();

  try {
    for (const [index, user] of fixture.users.entries()) {
      const otherUser = fixture.users[index === 0 ? 1 : 0];
      const response = await fetch(`${server.baseUrl}/community/history`, {
        headers: { "x-test-clerk-user-id": user.clerkUserId },
      });
      assert.equal(response.status, 200);
      const body = await response.json() as Record<string, unknown>;
      const serialized = JSON.stringify(body);

      assert.deepEqual(
        (body.claims as Array<{ id: string }>).map(({ id }) => id),
        [user.claimId],
      );
      assert.deepEqual(
        (body.reservations as Array<{ id: string }>).map(({ id }) => id),
        [user.reservationId],
      );
      assert.deepEqual(
        (body.volunteerRequests as Array<{ id: string }>).map(({ id }) => id),
        [user.volunteerId],
      );
      assert.deepEqual(
        (body.acknowledgments as Array<{ id: string }>).map(({ id }) => id),
        [user.acknowledgmentId],
      );
      assert.deepEqual(
        new Set((body.appointments as Array<{ id: string }>).map(({ id }) => id)),
        new Set([user.reservationId, user.volunteerId]),
      );

      for (const crossUserValue of [
        otherUser.accountId,
        otherUser.itemId,
        otherUser.claimId,
        otherUser.reservationId,
        otherUser.volunteerId,
        otherUser.acknowledgmentId,
        otherUser.trackingCode,
      ]) {
        assert.equal(serialized.includes(crossUserValue), false);
      }
      for (const sensitiveValue of Object.values(user.sensitive)) {
        assert.equal(serialized.includes(sensitiveValue), false);
      }
      for (const forbiddenField of [
        "approvedBy",
        "submittedBy",
        "notes",
        "by",
        "staffAssigned",
        "staffOwner",
        "internalNotes",
        "contactName",
        "contactEmail",
        "contactPhone",
        "pickupAddress",
        "address",
        "verifiedBy",
      ]) {
        assert.equal(serialized.includes(`"${forbiddenField}"`), false);
      }
    }
  } finally {
    await server.close();
    await cleanupFixture(fixture);
  }
});

test.after(async () => {
  await pool.end();
});