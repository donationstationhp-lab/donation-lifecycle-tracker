import assert from "node:assert/strict";
import test from "node:test";
import { proposeSnowRulesV2, CATERING_RULE } from "./snowRulesV2";
import { foodFacts, proposeSnowRulesV1 } from "./snowRulesV1";

test("v2 adds fresh perishable catering food without changing frozen v1", () => {
  const salad = { name: "Heirloom Tomato Salad", category: "food", donor: "Boka Catering", expiryDate: null };
  assert.equal(proposeSnowRulesV1(foodFacts(salad)), null);
  const result = proposeSnowRulesV2(salad);
  assert.equal(result?.tier, "URGENT");
  assert.equal(result?.rule, CATERING_RULE);
  assert.match(result!.rationale, /same-day distribution only/);
});

test("v2 recognizes source, donor and item notes, not cross-item policy examples", () => {
  for (const field of ["source", "donor", "notes"] as const) {
    const item = { name: "Freshly prepared cooked meal trays", category: "food", [field]: "Community restaurant kitchen, no label or date" };
    assert.equal(proposeSnowRulesV2(item)?.rule, CATERING_RULE);
  }
  assert.equal(proposeSnowRulesV2({
    name: "Salad", category: "food", notes: "Receipt not documented. CONTRAST WITH Restaurant kitchen trays.",
  }), null);
});

test("v2 retains homemade/explicit unlabeled/undated URGENT and sealed dated STABLE", () => {
  for (const name of ["Homemade brownies", "Unlabeled food", "Undated food"]) {
    assert.equal(proposeSnowRulesV2({ name, category: "food" })?.tier, "URGENT");
  }
  assert.equal(proposeSnowRulesV2({
    name: "Sealed and labeled salad", category: "food", donor: "Boka Catering", expiryDate: "2026-10-17",
  })?.tier, "STABLE");
  assert.equal(proposeSnowRulesV2({ name: "Unknown groceries", category: "food" }), null);
  assert.equal(proposeSnowRulesV2({ name: "Salad tray", category: "supplies", donor: "Restaurant" }), null);
  assert.equal(proposeSnowRulesV2({ name: "Canned beans", category: "food", donor: "Restaurant" }), null);
});
