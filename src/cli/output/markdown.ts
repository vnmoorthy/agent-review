// Markdown formatter suitable for posting as a PR comment.

import type { Finding, Severity } from "../../core/detectors/types.js";
import { summarize, severityIcon } from "./format.js";

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export interface MarkdownOptions {
  title?: string;
  showRationale: boolean;
}

export function formatMarkdown(findings: Finding[], opts: MarkdownOptions): string {
  const out: string[] = [];
  out.push(`# ${opts.title ?? "agent-review report"}`);
  out.push("");

  if (findings.length === 0) {
    out.push("No issues found.");
    return out.join("\n");
  }

  const s = summarize(findings);
  out.push(`**${s.total} finding${s.total === 1 ? "" : "s"}**`);
  out.push("");

  out.push("| Severity | Count |");
  out.push("|----------|------:|");
  for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    if (s.bySeverity[sev] === 0) continue;
    out.push(`| ${severityIcon(sev)} ${SEV_LABEL[sev]} | ${s.bySeverity[sev]} |`);
  }
  out.push("");

  out.push("| Detector | Title | Count |");
  out.push("|----------|-------|------:|");
  for (const [det, count] of Object.entries(s.byDetector).sort((a, b) => b[1] - a[1])) {
    const sample = findings.find((f) => f.detectorId === det);
    out.push(`| \`${det}\` | ${sample?.title ?? ""} | ${count} |`);
  }
  out.push("");

  let currentFile = "";
  for (const f of findings) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      out.push(`## \`${f.file}\``);
      out.push("");
    }
    out.push(
      `### ${severityIcon(f.severity)} ${SEV_LABEL[f.severity]}: \`${f.detectorId}\` — ${f.title}`
    );
    out.push("");
    out.push(`**Line ${f.line}** — ${f.message}`);
    out.push("");
    if (f.excerpt) {
      out.push("```");
      out.push(f.excerpt);
      out.push("```");
      out.push("");
    }
    if (opts.showRationale && f.rationale) {
      out.push(`> ${f.rationale}`);
      out.push("");
    }
    if (f.suggestion?.kind === "text-only" && f.suggestion.text) {
      out.push(`**Suggestion:** ${f.suggestion.text}`);
      out.push("");
    } else if (f.suggestion?.kind === "remove-lines") {
      out.push(
        `**Suggestion:** remove lines ${f.suggestion.startLine}-${f.suggestion.endLine}.`
      );
      out.push("");
    }
  }

  return out.join("\n");
}
