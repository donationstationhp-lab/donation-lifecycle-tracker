---
name: Workspace build defaults
description: Why frontend artifact Vite configuration provides local defaults for workflow-only runtime variables.
---

Artifact Vite configs should provide artifact-specific fallbacks for `PORT` and
`BASE_PATH` when those variables are absent, while continuing to honor values
supplied by a managed workflow.

**Why:** The root workspace build loads Vite configs without workflow-injected
runtime variables, but dev and preview workflows still need stable ports and
artifact routing paths.

**How to apply:** Keep numeric port validation, use workflow-provided values
first, and synchronize artifact-local fallbacks with each artifact's
`.replit-artifact/artifact.toml`; never replace them with one shared
workspace-wide value.
