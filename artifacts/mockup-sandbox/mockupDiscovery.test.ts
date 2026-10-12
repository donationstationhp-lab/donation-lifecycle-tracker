import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discoverMockupFiles } from "./mockupDiscovery.ts";

test("Mockup discovery preserves nested TSX files and excludes private/helper files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    "src/components/mockups/Z.tsx",
    "src/components/mockups/nested/A.tsx",
    "src/components/mockups/nested/_helper.tsx",
    "src/components/mockups/_private/Hidden.tsx",
    "src/components/mockups/.hidden.tsx",
    "src/components/mockups/nested/readme.txt",
    "src/components/unrelated/Other.tsx",
    "src/components/mockups/brace{{name}}.tsx",
  ];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), "");
  }
  assert.deepEqual(await discoverMockupFiles(root), [
    "src/components/mockups/Z.tsx",
    "src/components/mockups/brace{{name}}.tsx",
    "src/components/mockups/nested/A.tsx",
  ]);
});

test("Mockup discovery handles an absent directory without inventing components", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await discoverMockupFiles(root), []);
});
