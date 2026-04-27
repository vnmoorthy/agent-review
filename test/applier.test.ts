// Tests for the safe-fix applier. We use temp files in /tmp.

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applySafeFixes } from "../src/core/fixes/applier.js";

describe("applySafeFixes", () => {
  it("applies only auto-safe high-confidence remove-lines fixes", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-applier-"));
    const file = "foo.ts";
    writeFileSync(
      join(dir, file),
      ["import a from 'a'", "import b from 'b'", "import c from 'c'", "use(a, b, c)"].join("\n")
    );
    const result = applySafeFixes(dir, [
      {
        detectorId: "AR002",
        category: "dead-code",
        title: "Unused imports",
        file,
        line: 2,
        endLine: 2,
        severity: "low",
        confidence: "high",
        message: "Unused import.",
        suggestion: { kind: "remove-lines", startLine: 2, endLine: 2 },
      },
      {
        detectorId: "AR017",
        category: "safety",
        title: "Silent catch",
        file,
        line: 1,
        endLine: 1,
        severity: "high",
        confidence: "high",
        message: "Silent catch.",
        suggestion: { kind: "remove-lines", startLine: 1, endLine: 1 },
      },
    ]);
    expect(result.applied.length).toBe(1); // only AR002 (auto-safe)
    expect(result.skipped.length).toBe(1);
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).not.toContain("import b from 'b'");
    expect(after).toContain("import a from 'a'");
    expect(after).toContain("import c from 'c'");
  });
});
