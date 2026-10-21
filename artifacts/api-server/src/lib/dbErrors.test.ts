import assert from "node:assert/strict";
import test from "node:test";
import { isMissingColumn, isUniqueViolation } from "./dbErrors";

test("recognizes a direct PostgreSQL uniqueness error", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
});

test("recognizes a PostgreSQL uniqueness error nested in a cause", () => {
  assert.equal(
    isUniqueViolation(new Error("query failed", { cause: { code: "23505" } })),
    true,
  );
});

test("recognizes only the requested direct constraint", () => {
  assert.equal(
    isUniqueViolation({ code: "23505", constraint: "donation_items_item_id_unique" }, "donation_items_item_id_unique"),
    true,
  );
  assert.equal(
    isUniqueViolation({ code: "23505", constraint: "other_unique_constraint" }, "donation_items_item_id_unique"),
    false,
  );
});

test("recognizes requested constraints through wrapped database errors", () => {
  assert.equal(
    isUniqueViolation(
      new Error("query failed", {
        cause: { code: "23505", constraint: "donation_items_item_id_unique" },
      }),
      "donation_items_item_id_unique",
    ),
    true,
  );
  assert.equal(
    isUniqueViolation(
      new Error("query failed", {
        cause: { code: "23505", constraint: "transfers_active_item_idx" },
      }),
      "transfers_active_item_idx",
    ),
    true,
  );
});

test("does not classify unrelated database errors as uniqueness violations", () => {
  assert.equal(isUniqueViolation({ code: "23503" }), false);
  assert.equal(isUniqueViolation(new Error("23505")), false);
});

test("stops at circular causes", () => {
  const error: { code?: string; cause?: unknown } = {};
  error.cause = error;
  assert.equal(isUniqueViolation(error), false);
});

test("recognizes missing PostgreSQL columns through wrapped database errors", () => {
  const error = new Error("query failed", {
    cause: { code: "42703", column: "must_change_password" },
  });
  assert.equal(isMissingColumn(error, "must_change_password"), true);
  assert.equal(isMissingColumn(error, "bootstrap_token_used_at"), false);
  assert.equal(isMissingColumn({ code: "23505", column: "must_change_password" }), false);
  assert.equal(
    isMissingColumn(
      { code: "42703", message: 'column staff_users.must_change_password does not exist' },
      "must_change_password",
    ),
    true,
  );
});