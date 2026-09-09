---
name: OpenAPI integer codegen
description: Compatibility rule for whole-number OpenAPI response fields with the workspace's generated Zod schemas.
---

Model nonnegative whole-number response fields as `type: number` with
`multipleOf: 1` rather than `type: integer` while the workspace uses Zod 3.

**Why:** The current OpenAPI generator emits `zod.int()` for `integer`, but
that API is unavailable in the installed Zod version, causing generated
library typechecking to fail.

**How to apply:** Use `number`, an appropriate minimum, and `multipleOf: 1`
for new integer-valued response fields until the generator and Zod version are
known to support the same integer API.