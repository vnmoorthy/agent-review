import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isGitignored, loadGitignoreRules } from "../src/core/gitignore.js";

describe("gitignore", () => {
  it("matches simple file patterns", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-gi-"));
    writeFileSync(join(dir, ".gitignore"), "*.log\nnode_modules\n");
    const rules = loadGitignoreRules(dir);
    expect(isGitignored("foo.log", rules)).toBe(true);
    expect(isGitignored("node_modules/foo.js", rules)).toBe(true);
    expect(isGitignored("src/foo.ts", rules)).toBe(false);
  });

  it("respects negation", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-gi-"));
    writeFileSync(join(dir, ".gitignore"), "build/\n!build/keep.txt\n");
    const rules = loadGitignoreRules(dir);
    expect(isGitignored("build/foo.txt", rules)).toBe(true);
    expect(isGitignored("build/keep.txt", rules)).toBe(false);
  });

  it("returns empty when no .gitignore exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-gi-"));
    expect(loadGitignoreRules(dir).length).toBe(0);
  });

  it("ignores comments and blank lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-gi-"));
    writeFileSync(
      join(dir, ".gitignore"),
      "# this is a comment\n\n*.tmp\n  # indented comment\n"
    );
    const rules = loadGitignoreRules(dir);
    expect(rules.length).toBe(1);
    expect(isGitignored("foo.tmp", rules)).toBe(true);
  });
});
