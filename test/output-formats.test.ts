import { describe, it, expect } from "vitest";
import { formatJunit } from "../src/cli/output/junit.js";
import { formatHtml } from "../src/cli/output/html.js";

const sample: any[] = [
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
    message: "Debug print.",
    excerpt: "console.log('debug')",
  },
];

describe("JUnit output", () => {
  it("emits well-formed XML with one testsuite per file", () => {
    const xml = formatJunit(sample);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<testsuites name="agent-review"');
    expect(xml).toContain('name="src/foo.ts"');
    expect(xml).toContain('name="src/bar.ts"');
    expect(xml).toContain("<failure"); // high severity
    expect(xml).toContain("<error"); // medium severity
  });

  it("escapes XML special chars in messages", () => {
    const f: any = { ...sample[0], message: 'has <chars> & "quotes"' };
    const xml = formatJunit([f]);
    expect(xml).toContain("&lt;chars&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
  });

  it("emits a non-empty wrapper when no findings", () => {
    const xml = formatJunit([]);
    expect(xml).toContain('tests="0"');
  });
});

describe("HTML output", () => {
  it("renders findings with severity badges", () => {
    const html = formatHtml(sample);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("AR017");
    expect(html).toContain("AR012");
    expect(html).toContain("src/foo.ts");
  });

  it("escapes HTML entities", () => {
    const f: any = { ...sample[0], message: "<script>alert(1)</script>" };
    const html = formatHtml([f]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
