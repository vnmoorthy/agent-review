// Core types shared by every detector. Keep this file dependency-free so it
// can be imported anywhere without pulling in tree-sitter or git utilities.

import type { FileDiff, ParsedDiff } from "../git/diff.js";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface FixSuggestion {
  // The kind of edit to make.
  kind: "remove-lines" | "replace-range" | "add-import" | "text-only";
  // For remove-lines: the inclusive line range (1-indexed).
  startLine?: number;
  endLine?: number;
  // For replace-range: the inclusive 1-indexed range and replacement text.
  replacement?: string;
  // For add-import: the import statement to insert at the top of the file.
  importStatement?: string;
  // For text-only: human-readable advice with no automatic edit.
  text?: string;
}

export interface Finding {
  detectorId: string;
  category: string;
  title: string;
  file: string;
  // 1-indexed line numbers in the new content.
  line: number;
  endLine: number;
  severity: Severity;
  // One-liner shown next to the file:line.
  message: string;
  // The source code snippet that triggered the finding.
  excerpt?: string;
  // Optional structured fix.
  suggestion?: FixSuggestion;
  // The detector's confidence the finding is real (not a false positive).
  confidence: "high" | "medium" | "low";
  // For LLM-driven findings: the brief reasoning trace from the model.
  rationale?: string;
}

export interface DetectorContext {
  // Path to the file being analyzed, relative to the repo root.
  filePath: string;
  // The whole parsed diff so detectors can reason cross-file.
  diff: ParsedDiff;
  // The diff entry for this specific file.
  fileDiff: FileDiff;
  // The file's new content as plain text. May be undefined for deleted files.
  newContent?: string;
  // The file's old content as plain text. May be undefined for added files.
  oldContent?: string;
  // The 1-indexed set of line numbers that were changed in the new content.
  changedLines: Set<number>;
  // The repository root.
  repoRoot: string;
  // Optional handle to a parsed AST. Detectors that don't need an AST can
  // ignore this; the loader fills it in lazily for files in supported
  // languages.
  ast?: unknown;
  // Project-level info computed once per run.
  project: ProjectInfo;
}

export interface ProjectInfo {
  // Detected ecosystems present at the repo root.
  ecosystems: Array<"node" | "python" | "go" | "rust">;
  // Declared dependencies: package.json deps + dev deps + Python requirements.
  declaredDependencies: Set<string>;
  // Inferred naming conventions per language, used by AR014.
  conventions: {
    js: "camelCase" | "snake_case" | "mixed" | "unknown";
    py: "camelCase" | "snake_case" | "mixed" | "unknown";
  };
  // Files that exist in the repo (used for orphan detection in AR016).
  importedPaths: Set<string>;
}

export interface Detector {
  id: string;
  category: string;
  // A human-friendly title.
  title: string;
  // Whether this detector applies to a given file. Cheap to evaluate.
  applies: (ctx: DetectorContext) => boolean;
  // Run the detector. Should return findings (possibly an empty array).
  // Detectors must NEVER throw; on internal error they should return [].
  run: (ctx: DetectorContext) => Finding[] | Promise<Finding[]>;
}
