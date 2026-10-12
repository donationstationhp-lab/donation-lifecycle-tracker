import { glob } from "node:fs/promises";

// These patterns are fixed source-code constants, never browser input.
// Node 24 supplies glob directly, so no micromatch/braces dependency is needed.
export async function discoverMockupFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of glob("src/components/mockups/**/*.tsx", {
    cwd: root,
    exclude: ["**/_*/**", "**/_*.tsx"],
  })) {
    files.push(file);
  }
  return files.sort();
}
