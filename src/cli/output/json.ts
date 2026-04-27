// Stable JSON output schema. Documented in docs/json-schema.md.

import type { Finding } from "../../core/detectors/types.js";
import { summarize } from "./format.js";

export interface JsonReport {
  schema: "agent-review/v1";
  generatedAt: string;
  summary: ReturnType<typeof summarize>;
  findings: Finding[];
}

export function formatJson(findings: Finding[]): string {
  const report: JsonReport = {
    schema: "agent-review/v1",
    generatedAt: new Date().toISOString(),
    summary: summarize(findings),
    findings,
  };
  return JSON.stringify(report, null, 2);
}
