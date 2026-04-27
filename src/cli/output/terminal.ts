// Pretty terminal formatter. Uses chalk when available; falls back to plain
// text when stdout isn't a TTY or `--no-color` is set.

import type { Finding, Severity } from "../../core/detectors/types.js";
import { summarize, severityIcon } from "./format.js";

let chalkInstance: any = null;
function getChalk(noColor: boolean): any {
  if (noColor) return null;
  if (chalkInstance) return chalkInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    chalkInstance = require("chalk");
    if (chalkInstance.default) chalkInstance = chalkInstance.default;
  } catch {
    chalkInstance = null;
  }
  return chalkInstance;
}

export interface TerminalOptions {
  noColor: boolean;
  showRationale: boolean;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "cyan",
  info: "gray",
};

export function formatTerminal(findings: Finding[], opts: TerminalOptions): string {
  const c = getChalk(opts.noColor);
  const apply = (color: string, s: string): string => {
    if (!c || !c[color]) return s;
    return c[color](s);
  };
  const bold = (s: string) => (c?.bold ? c.bold(s) : s);
  const dim = (s: string) => (c?.dim ? c.dim(s) : s);

  const out: string[] = [];
  if (findings.length === 0) {
    out.push(apply("green", "agent-review: no issues found."));
    return out.join("\n");
  }

  const summary = summarize(findings);
  out.push(
    bold(`agent-review: ${summary.total} finding${summary.total === 1 ? "" : "s"}`)
  );
  const sevLine = (["critical", "high", "medium", "low", "info"] as Severity[])
    .filter((s) => summary.bySeverity[s] > 0)
    .map((s) => `${apply(SEVERITY_COLORS[s], severityIcon(s) + " " + s)} ${summary.bySeverity[s]}`)
    .join("   ");
  out.push("  " + sevLine);
  const catLine = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat} (${n})`)
    .join("   ");
  out.push("  " + dim(catLine));
  out.push("");

  let currentFile = "";
  for (const f of findings) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      out.push(bold(`${f.file}`));
    }
    const sevLabel = apply(SEVERITY_COLORS[f.severity], `${severityIcon(f.severity)} ${f.severity}`);
    const conf = dim(`(${f.confidence})`);
    out.push(
      `  ${sevLabel}  ${apply("magenta", f.detectorId)}  ${f.title}  ${conf}`
    );
    out.push(
      `    ${dim(`${f.file}:${f.line}`)}  ${f.message}`
    );
    if (f.excerpt) {
      const lines = f.excerpt.split("\n").map((l) => "      " + dim(l));
      out.push(...lines);
    }
    if (opts.showRationale && f.rationale) {
      out.push(`    ${dim("rationale:")} ${f.rationale}`);
    }
    if (f.suggestion?.kind === "text-only" && f.suggestion.text) {
      out.push(`    ${dim("suggestion:")} ${f.suggestion.text}`);
    } else if (f.suggestion?.kind === "remove-lines") {
      out.push(
        `    ${dim("suggestion:")} remove lines ${f.suggestion.startLine}-${f.suggestion.endLine}`
      );
    }
    out.push("");
  }
  return out.join("\n");
}
