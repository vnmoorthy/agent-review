// Public entry point. Re-exports the types and helpers other tooling can
// consume when treating agent-review as a library rather than a CLI.

export type { Finding, Severity, Detector, DetectorContext } from "./core/detectors/types.js";
export type { ParsedDiff, FileDiff, DiffHunk, FileStatus } from "./core/git/diff.js";
export { runDetectors } from "./core/detectors/index.js";
export { TAXONOMY, getTaxonomyEntry } from "./core/taxonomy/registry.js";
export type { TaxonomyEntry, Category, FixKind, DetectionType } from "./core/taxonomy/registry.js";
export { collectDiff } from "./core/git/diff.js";
export { formatTerminal } from "./cli/output/terminal.js";
export { formatMarkdown } from "./cli/output/markdown.js";
export { formatJson } from "./cli/output/json.js";
export { renderSuggestion } from "./core/fixes/suggestions.js";
export { applySafeFixes } from "./core/fixes/applier.js";
