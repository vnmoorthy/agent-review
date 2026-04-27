// Shared utilities for output formatters.

import type { Finding, Severity } from "../../core/detectors/types.js";

export interface SummaryStats {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<string, number>;
  byDetector: Record<string, number>;
  highestSeverity: Severity;
}

export function summarize(findings: Finding[]): SummaryStats {
  const bySeverity: Record<Severity, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byCategory: Record<string, number> = {};
  const byDetector: Record<string, number> = {};
  let highest: Severity = "info";
  const order: Severity[] = ["info", "low", "medium", "high", "critical"];
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byDetector[f.detectorId] = (byDetector[f.detectorId] ?? 0) + 1;
    if (order.indexOf(f.severity) > order.indexOf(highest)) highest = f.severity;
  }
  return {
    total: findings.length,
    bySeverity,
    byCategory,
    byDetector,
    highestSeverity: highest,
  };
}

export function severityIcon(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "!!";
    case "high":
      return "!";
    case "medium":
      return "*";
    case "low":
      return "-";
    case "info":
      return ".";
  }
}

export function clampLine(line: number, totalLines: number): number {
  if (line < 1) return 1;
  if (line > totalLines) return totalLines;
  return line;
}
