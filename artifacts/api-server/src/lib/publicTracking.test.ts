import assert from "node:assert/strict";
import test from "node:test";
import {
  publicClaimStatusLabel,
  safeCategory,
  safeItemName,
} from "../routes/publicTrack";

test("public item labels never echo unknown free-form content", () => {
  const privateName = "Donation for Jane Doe, 123 Main Street, jane@example.com";
  const privateCategory = "Smith family request";

  assert.equal(safeCategory(privateCategory), "Donation");
  assert.equal(safeItemName(privateName, privateCategory), "Donation item");
});

test("known categories and items resolve only to curated labels", () => {
  assert.equal(safeCategory("FOOD"), "Food");
  assert.equal(
    safeItemName("Frozen chicken from Jane Doe at 123 Main Street", "Food"),
    "Frozen chicken",
  );
  assert.equal(
    safeItemName("Call 312-555-0100 about winter shirt", "Clothing"),
    "Shirt",
  );
});

test("public claim statuses use curated language", () => {
  assert.equal(publicClaimStatusLabel("approved"), "Claim Approved");
  assert.equal(publicClaimStatusLabel("fulfilled"), "Completed");
  assert.equal(publicClaimStatusLabel("private_internal_status"), "In Progress");
});