// Tests for output formatters.

import { describe, it, expect } from "vitest";
import { formatJson } from "../src/cli/output/json.js";
import { formatMarkdown } from "../src/cli/output/markdown.js";
import { formatTerminal } from "../src/cli/output/terminal.js";
import type { Finding } from "../src/core/detectors/types.js";

const sample: Finding[] = [
  {
    detectorId: "AR001",
    category: "dead-code",
    title: "Dead code introduced",
    file: "src/foo.ts",
    line: 10,
    endLine: 10,
    severity: "medium",
    confidence: "high",
    message: "`unused` is defined but never referenced.",
    excerpt: "function unused() { return 2 }",
    suggestion: { kind: "remove-lines", startLine: 10, endLine: 10 },
  },
];

describe("formatJson", () => {
  it("emits a stable schema", () => {
    const out = JSON.parse(formatJson(sample));
    expect(out.schema).toBe("agent-review/v1");
    expect(out.summary.total).toBe(1);
    expect(out.findings[0].detectorId).toBe("AR001");
  });
});

describe("formatMarkdown", () => {
  it("includes the title and a summary table", () => {
    const out = formatMarkdown(sample, { showRationale: false });
    expect(out).toContain("agent-review report");
    expect(out).toContain("AR001");
    expect(out).toContain("Severity");
  });
  it("handles empty findings gracefully", () => {
    const out = formatMarkdown([], { showRationale: false });
    expect(out).toContain("No issues found");
  });
});

describe("formatTerminal", () => {
  it("prints the file and finding", () => {
    const out = formatTerminal(sample, { noColor: true, showRationale: false });
    expect(out).toContain("src/foo.ts");
    expect(out).toContain("AR001");
    expect(out).toContain("Dead code introduced");
  });
  it("handles empty findings gracefully", () => {
    const out = formatTerminal([], { noColor: true, showRationale: false });
    expect(out).toContain("no issues");
  });
});
