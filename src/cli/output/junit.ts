// JUnit XML output. Most non-GitHub CIs (Jenkins, Buildkite, GitLab,
// CircleCI, TeamCity) consume this format natively to render results.
//
// Mapping:
//   - One <testsuite> per file with findings
//   - One <testcase> per finding (name = "AR0XX: title", classname = file path)
//   - High/critical -> <failure>, others -> <error> (visible but non-blocking)

import type { Finding, Severity } from "../../core/detectors/types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isFailure(s: Severity): boolean {
  return s === "high" || s === "critical";
}

export function formatJunit(findings: Finding[]): string {
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }

  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  const totalTests = findings.length;
  const totalFailures = findings.filter((f) => isFailure(f.severity)).length;
  const totalErrors = findings.length - totalFailures;
  out.push(
    `<testsuites name="agent-review" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}">`
  );

  if (byFile.size === 0) {
    out.push(`  <testsuite name="agent-review" tests="0" failures="0" errors="0"/>`);
  }

  for (const [file, fs] of byFile) {
    const fails = fs.filter((f) => isFailure(f.severity)).length;
    const errs = fs.length - fails;
    out.push(
      `  <testsuite name="${esc(file)}" tests="${fs.length}" failures="${fails}" errors="${errs}">`
    );
    for (const f of fs) {
      const name = `${f.detectorId}: ${f.title}`;
      out.push(
        `    <testcase classname="${esc(f.file)}" name="${esc(name)}" file="${esc(f.file)}" line="${f.line}">`
      );
      const tag = isFailure(f.severity) ? "failure" : "error";
      out.push(
        `      <${tag} type="${esc(f.detectorId)}" message="${esc(f.message)}"><![CDATA[${f.file}:${f.line}\n${f.excerpt ?? ""}]]></${tag}>`
      );
      out.push(`    </testcase>`);
    }
    out.push(`  </testsuite>`);
  }

  out.push(`</testsuites>`);
  return out.join("\n");
}
