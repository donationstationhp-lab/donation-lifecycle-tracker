import assert from "node:assert/strict";
import test from "node:test";
import { isUniqueViolation } from "./dbErrors";

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