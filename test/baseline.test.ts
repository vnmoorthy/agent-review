import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  saveBaseline,
  loadBaseline,
  filterAgainstBaseline,
  fingerprintFinding,
} from "../src/core/baseline.js";

const sample: any[] = [
  {
    detectorId: "AR001",
    category: "dead-code",
    title: "Dead code introduced",
    file: "src/foo.ts",
    line: 10,
    endLine: 10,
    severity: "medium",
    confidence: "medium",
    message: "Dead helper",
    excerpt: "function unused() {",
  },
  {
    detectorId: "AR012",
    category: "drive-by",
    title: "Debug print left behind",
    file: "src/bar.ts",
    line: 5,
    endLine: 5,
    severity: "medium",
    confidence: "high",
    message: "console.log left in",
    excerpt: "console.log('debug')",
  },
];

describe("baseline", () => {
  it("save + load roundtrips findings", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-baseline-"));
    const path = join(dir, "baseline.json");
    saveBaseline(path, sample);
    const baseline = loadBaseline(path);
    expect(baseline?.entries.length).toBe(2);
    expect(baseline?.schema).toBe("agent-review-baseline/v1");
  });

  it("filterAgainstBaseline drops fingerprinted findings", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-baseline-"));
    const path = join(dir, "baseline.json");
    saveBaseline(path, [sample[0]]);
    const baseline = loadBaseline(path);
    const { newFindings, suppressed } = filterAgainstBaseline(sample, baseline);
    expect(newFindings.map((f) => f.detectorId)).toEqual(["AR012"]);
    expect(suppressed.map((f) => f.detectorId)).toEqual(["AR001"]);
  });

  it("fingerprint is stable for identical findings", () => {
    expect(fingerprintFinding(sample[0])).toBe(fingerprintFinding(sample[0]));
  });
});
