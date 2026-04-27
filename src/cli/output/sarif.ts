// SARIF 2.1.0 output. Conforms to the subset GitHub Code Scanning accepts:
// https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
//
// One run per invocation, one rule per detector ID, one result per finding.
// Levels map agent-review severities to the SARIF "level" enum
// (note: SARIF accepts only "none" | "note" | "warning" | "error").

import type { Finding, Severity } from "../../core/detectors/types.js";
import { TAXONOMY } from "../../core/taxonomy/registry.js";

const SARIF_LEVEL: Record<Severity, "note" | "warning" | "error" | "none"> = {
  info: "note",
  low: "note",
  medium: "warning",
  high: "error",
  critical: "error",
};

const SARIF_RANK: Record<Severity, number> = {
  info: 5,
  low: 25,
  medium: 50,
  high: 80,
  critical: 100,
};

interface SarifReport {
  $schema: string;
  version: "2.1.0";
  runs: any[];
}

export function formatSarif(findings: Finding[], opts: { toolVersion: string }): string {
  const rules = TAXONOMY.map((t) => ({
    id: t.id,
    name: t.title.replace(/\s+/g, ""),
    shortDescription: { text: t.title },
    fullDescription: { text: t.description },
    helpUri: `https://github.com/agent-review/agent-review/blob/main/TAXONOMY.md#${t.id.toLowerCase()}`,
    help: {
      text: `${t.title}\n\n${t.description}\n\nWhy agents do this: ${t.whyAgentsDoThis}`,
      markdown: `## ${t.id}: ${t.title}\n\n${t.description}\n\n**Why agents do this:** ${t.whyAgentsDoThis}\n\n[Read the full taxonomy entry](https://github.com/agent-review/agent-review/blob/main/TAXONOMY.md#${t.id.toLowerCase()})`,
    },
    properties: {
      category: t.category,
      tags: ["agent-review", t.category, t.detectionType],
      "security-severity": String(SARIF_RANK[t.severity]),
    },
    defaultConfiguration: {
      level: SARIF_LEVEL[t.severity],
    },
  }));

  const results = findings.map((f) => ({
    ruleId: f.detectorId,
    ruleIndex: TAXONOMY.findIndex((t) => t.id === f.detectorId),
    level: SARIF_LEVEL[f.severity],
    message: {
      text: f.message,
      ...(f.rationale ? { markdown: `${f.message}\n\n_Rationale:_ ${f.rationale}` } : {}),
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file },
          region: {
            startLine: f.line,
            endLine: f.endLine,
            ...(f.excerpt
              ? {
                  snippet: { text: f.excerpt },
                }
              : {}),
          },
        },
      },
    ],
    properties: {
      detectorId: f.detectorId,
      category: f.category,
      confidence: f.confidence,
    },
    ...(f.suggestion && f.suggestion.kind === "remove-lines"
      ? {
          fixes: [
            {
              description: { text: "Remove the lines flagged by this rule." },
              artifactChanges: [
                {
                  artifactLocation: { uri: f.file },
                  replacements: [
                    {
                      deletedRegion: {
                        startLine: f.suggestion.startLine,
                        endLine: f.suggestion.endLine,
                      },
                      insertedContent: { text: "" },
                    },
                  ],
                },
              ],
            },
          ],
        }
      : {}),
  }));

  const report: SarifReport = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agent-review",
            version: opts.toolVersion,
            informationUri: "https://github.com/agent-review/agent-review",
            rules,
          },
        },
        results,
        columnKind: "utf16CodeUnits",
      },
    ],
  };
  return JSON.stringify(report, null, 2);
}
