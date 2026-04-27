// Applies safe fixes to files on disk.
//
// Safety rules:
// - Only `auto-safe` taxonomy entries are eligible.
// - Only findings with confidence === "high" are applied.
// - Only `remove-lines` suggestions are applied automatically. Other
//   suggestion kinds become advisory output.
// - Edits are batched per file and applied bottom-up so line numbers don't
//   shift mid-application.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Finding } from "../detectors/types.js";
import { getTaxonomyEntry } from "../taxonomy/registry.js";
import { logger } from "../logger.js";

export interface ApplyResult {
  applied: Finding[];
  skipped: Finding[];
  files: string[];
}

export function applySafeFixes(
  repoRoot: string,
  findings: Finding[]
): ApplyResult {
  const log = logger().child("apply");
  const eligible: Finding[] = [];
  const skipped: Finding[] = [];
  for (const f of findings) {
    const entry = getTaxonomyEntry(f.detectorId);
    if (!entry || entry.fixKind !== "auto-safe") {
      skipped.push(f);
      continue;
    }
    if (f.confidence !== "high") {
      skipped.push(f);
      continue;
    }
    if (f.suggestion?.kind !== "remove-lines") {
      skipped.push(f);
      continue;
    }
    eligible.push(f);
  }

  // Group by file.
  const byFile = new Map<string, Finding[]>();
  for (const f of eligible) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }

  const applied: Finding[] = [];
  for (const [file, fs] of byFile) {
    const path = resolve(repoRoot, file);
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch (err) {
      log.warn(`cannot read ${file}; skipping`, err);
      for (const f of fs) skipped.push(f);
      continue;
    }
    const lines = content.split("\n");
    // Sort fixes bottom-up by startLine.
    const sorted = [...fs].sort((a, b) => {
      const aS = a.suggestion?.startLine ?? a.line;
      const bS = b.suggestion?.startLine ?? b.line;
      return bS - aS;
    });
    for (const f of sorted) {
      const start = f.suggestion?.startLine ?? f.line;
      const end = f.suggestion?.endLine ?? f.endLine;
      if (start < 1 || end < 1 || end > lines.length) {
        skipped.push(f);
        continue;
      }
      lines.splice(start - 1, end - start + 1);
      applied.push(f);
    }
    try {
      writeFileSync(path, lines.join("\n"));
    } catch (err) {
      log.warn(`cannot write ${file}; reverting state`, err);
      for (const f of sorted) {
        const idx = applied.indexOf(f);
        if (idx >= 0) applied.splice(idx, 1);
        skipped.push(f);
      }
    }
  }

  return {
    applied,
    skipped,
    files: Array.from(byFile.keys()),
  };
}
