const assert = require("node:assert/strict");
const { test } = require("node:test");
const { commonTrailingPseudos } = require("@tailwindcss/typography/src/utils.js");

// Expected results were captured from the original parser before upgrading.
const cases = [
  ["p::before, div::before", ["::before", "p, div"]],
  ["p::before, div::after", [null, "p::before, div::after"]],
  ["p:hover::before, a:focus::before", ["::before", "p:hover, a:focus"]],
  ["p::marker::before, li::marker::before", ["::marker::before", "p, li"]],
  ['[data-label="a,b"]::after, .card:is(.a,.b)::after', ["::after", '[data-label="a,b"], .card:is(.a,.b)']],
  [':where(.prose) p:not(:where([class~="not-prose"] *))', [null, ':where(.prose) p:not(:where([class~="not-prose"] *))']],
];

for (const [selector, expected] of cases) {
  test(`Typography selector behavior is preserved: ${selector}`, () => {
    assert.deepEqual(commonTrailingPseudos(selector), expected);
  });
}
