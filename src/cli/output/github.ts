// GitHub Actions annotation format. When emitted to stdout/stderr inside a
// GitHub Actions job, these strings turn into inline annotations on PR diffs:
// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
//
// We map agent-review severity to the three supported annotation levels:
//   info / low     -> ::notice
//   medium         -> ::warning
//   high / critical-> ::error

import type { Finding, Severity } from "../../core/detectors/types.js";

const LEVEL: Record<Severity, "notice" | "warning" | "error"> = {
  info: "notice",
  low: "notice",
  medium: "warning",
  high: "error",
  critical: "error",
};

function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProp(s: string): string {
  return s
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

export function formatGithubAnnotations(findings: Finding[]): string {
  const out: string[] = [];
  for (const f of findings) {
    const level = LEVEL[f.severity];
    const props = [
      `file=${escapeProp(f.file)}`,
      `line=${f.line}`,
      `endLine=${f.endLine}`,
      `title=${escapeProp(`${f.detectorId}: ${f.title}`)}`,
    ].join(",");
    out.push(`::${level} ${props}::${escapeData(f.message)}`);
  }
  return out.join("\n");
}
