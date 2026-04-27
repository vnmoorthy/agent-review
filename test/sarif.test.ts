import { describe, it, expect } from "vitest";
import { formatSarif } from "../src/cli/output/sarif.js";
import { formatGithubAnnotations } from "../src/cli/output/github.js";

const findings: any[] = [
  {
    detectorId: "AR017",
    category: "safety",
    title: "Silent or swallowed catch",
    file: "src/foo.ts",
    line: 42,
    endLine: 42,
    severity: "high",
    confidence: "high",
    message: "Catch swallows the error.",
    excerpt: "} catch (e) {}",
    suggestion: { kind: "remove-lines", startLine: 42, endLine: 42 },
  },
];

describe("SARIF output", () => {
  it("emits a valid 2.1.0 envelope", () => {
    const sarif = JSON.parse(formatSarif(findings, { toolVersion: "0.1.0" }));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("agent-review");
  });

  it("maps high severity to error", () => {
    const sarif = JSON.parse(formatSarif(findings, { toolVersion: "0.1.0" }));
    expect(sarif.runs[0].results[0].level).toBe("error");
  });

  it("includes a rule definition for every taxonomy entry", () => {
    const sarif = JSON.parse(formatSarif(findings, { toolVersion: "0.1.0" }));
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r: any) => r.id);
    expect(ruleIds).toContain("AR001");
    expect(ruleIds).toContain("AR035");
    expect(ruleIds.length).toBe(35);
  });
});

describe("GitHub annotations", () => {
  it("emits ::error/::warning lines", () => {
    const out = formatGithubAnnotations(findings);
    expect(out).toContain("::error");
    expect(out).toContain("file=src/foo.ts");
    expect(out).toContain("line=42");
  });

  it("escapes commas and colons in titles", () => {
    const f: any = { ...findings[0], title: "Title, with: chars", message: "msg" };
    const out = formatGithubAnnotations([f]);
    expect(out).toContain("%2C");
    expect(out).toContain("%3A");
  });
});
