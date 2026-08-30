---
name: Workspace build defaults
description: How artifact Vite configuration should behave during root builds and managed workflows.
---

Artifact Vite configs should use safe defaults for `PORT` and `BASE_PATH` when
those variables are absent, while continuing to honor values supplied by a
managed workflow.

**Why:** The root one-command production build loads Vite configs without
runtime workflow variables, but dev and preview workflows still need their
configured ports and artifact routing paths.

**How to apply:** Keep numeric port validation and use workflow-provided
environment values first; only fall back to artifact-local build defaults when
the variables are missing.