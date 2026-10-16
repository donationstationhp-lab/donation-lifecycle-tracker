import assert from "node:assert/strict";
import test from "node:test";
import { grantConfiguredStaffAccess, type StaffDirectory } from "./staffAccessGrants";

function fixture(role: string | undefined = undefined, verified = true, marker = false) {
  const user = {
    id: "synthetic-user", emailAddresses: [{
      emailAddress: "fixture@example.com", verification: { status: verified ? "verified" : "unverified" },
    }],
    publicMetadata: { ...(role ? { role } : {}), unrelated: "preserve" } as Record<string, unknown>,
    privateMetadata: { unrelatedPrivate: true, ...(marker ? { donationStationStaffEmailGrant: true } : {}) } as Record<string, unknown>,
  };
  let updates = 0;
  let creates = 0;
  const users: StaffDirectory = {
    async find() { return [user]; },
    async create() { creates++; },
    async update(id, publicMetadata, privateMetadata) {
      assert.equal(id, user.id);
      updates++;
      user.publicMetadata = publicMetadata;
      user.privateMetadata = privateMetadata;
    },
  };
  return { user, users, updates: () => updates, creates: () => creates };
}

test("verified owner-approved account receives staff role, preserving other metadata", async () => {
  const f = fixture("community");
  assert.deepEqual(await grantConfiguredStaffAccess("fixture@example.com", f.users), ["granted"]);
  assert.equal(f.user.publicMetadata.role, "staff");
  assert.equal(f.user.publicMetadata.unrelated, "preserve");
  assert.equal(f.user.privateMetadata.unrelatedPrivate, true);
  assert.equal(f.creates(), 0);
});

test("existing supervisor is never downgraded and reruns do not rewrite a grant", async () => {
  const f = fixture("supervisor");
  await grantConfiguredStaffAccess("fixture@example.com", f.users);
  assert.equal(f.user.publicMetadata.role, "supervisor");
  assert.deepEqual(await grantConfiguredStaffAccess("fixture@example.com", f.users), ["already_granted"]);
  assert.equal(f.updates(), 1);
});

test("subsequent revocation is respected rather than restored on restart", async () => {
  const f = fixture("community", true, true);
  assert.deepEqual(await grantConfiguredStaffAccess("fixture@example.com", f.users), ["revoked"]);
  assert.equal(f.user.publicMetadata.role, "community");
  assert.equal(f.updates(), 0);
});

test("unverified accounts and ambiguous email matches are not promoted", async () => {
  const f = fixture(undefined, false);
  assert.deepEqual(await grantConfiguredStaffAccess("fixture@example.com", f.users), ["unverified"]);
  assert.equal(f.updates(), 0);
  f.users.find = async () => [f.user, { ...f.user, id: "other-synthetic-user" }];
  assert.deepEqual(await grantConfiguredStaffAccess("fixture@example.com", f.users), ["ambiguous"]);
  assert.equal(f.updates(), 0);
});

test("new emails are created once via the directory without changing existing accounts", async () => {
  const f = fixture();
  f.users.find = async () => [];
  assert.deepEqual(await grantConfiguredStaffAccess("NEW@example.com, new@EXAMPLE.com", f.users), ["created"]);
  assert.equal(f.creates(), 1);
  assert.equal(f.updates(), 0);
});

test("no configuration makes no calls; invalid input and directory failures return safe statuses", async () => {
  const f = fixture();
  f.users.find = async () => { throw new Error("sensitive provider details"); };
  assert.deepEqual(await grantConfiguredStaffAccess("", f.users), []);
  assert.deepEqual(await grantConfiguredStaffAccess("not-an-email,fixture@example.com", f.users), ["failed", "failed"]);
});
