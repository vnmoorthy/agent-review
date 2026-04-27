// Baseline mode. Records existing findings as a baseline so the tool only
// reports NEW findings going forward. Critical for adopting agent-review on
// an existing codebase that already has accumulated tech debt.
//
// The baseline file is a small JSON document with a fingerprint per finding.
// We store fingerprints (file + detectorId + a content-derived hash) rather
// than raw line numbers so they survive minor reformatting.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import type { Finding } from "./detectors/types.js";

export interface BaselineEntry {
  detectorId: string;
  file: string;
  fingerprint: string;
  // Stored only so humans browsing the baseline file can see what was suppressed.
  message?: string;
}

export interface BaselineFile {
  schema: "agent-review-baseline/v1";
  generatedAt: string;
  entries: BaselineEntry[];
}

const DEFAULT_PATH = ".agent-review-baseline.json";

export function defaultBaselinePath(repoRoot: string): string {
  return join(repoRoot, DEFAULT_PATH);
}

export function fingerprintFinding(f: Finding): string {
  // We hash the detector + file + a normalized excerpt. Excerpt-based
  // fingerprints survive line-number drift caused by unrelated edits above.
  const norm = (f.excerpt ?? "").replace(/\s+/g, " ").trim();
  const h = createHash("sha1");
  h.update(`${f.detectorId}|${f.file}|${norm}|${f.message}`);
  return h.digest("hex").slice(0, 16);
}

export function loadBaseline(path: string): BaselineFile | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data?.schema !== "agent-review-baseline/v1") return null;
    if (!Array.isArray(data?.entries)) return null;
    return data as BaselineFile;
  } catch {
    return null;
  }
}

export function saveBaseline(path: string, findings: Finding[]): BaselineFile {
  const entries: BaselineEntry[] = findings.map((f) => ({
    detectorId: f.detectorId,
    file: f.file,
    fingerprint: fingerprintFinding(f),
    message: f.message,
  }));
  const baseline: BaselineFile = {
    schema: "agent-review-baseline/v1",
    generatedAt: new Date().toISOString(),
    entries,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(baseline, null, 2));
  return baseline;
}

// Filter findings against a baseline. Returns only those NOT in the baseline.
export function filterAgainstBaseline(
  findings: Finding[],
  baseline: BaselineFile | null
): { newFindings: Finding[]; suppressed: Finding[] } {
  if (!baseline) return { newFindings: findings, suppressed: [] };
  const set = new Set(baseline.entries.map((e) => e.fingerprint));
  const newFindings: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const f of findings) {
    const fp = fingerprintFinding(f);
    if (set.has(fp)) suppressed.push(f);
    else newFindings.push(f);
  }
  return { newFindings, suppressed };
}
