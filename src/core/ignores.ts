// Inline ignore directives. Modeled on ESLint's directive language so anyone
// who's used a linter will recognize the syntax.
//
// Supported forms:
//   // agent-review-ignore-next-line
//   // agent-review-ignore-next-line AR012, AR017
//   // agent-review-ignore-line
//   // agent-review-ignore-line AR012
//   // agent-review-ignore-file
//   // agent-review-ignore-file AR012, AR017
//   // agent-review-disable
//   // agent-review-enable
//
// All directives accept Python (`#`), JS/TS/Go/Rust (`//`), and block-comment
// (`/* ... */`) host syntaxes.
//
// "all" is implicit when no IDs are listed; otherwise IDs are AND-OR'd: the
// finding is suppressed if its detectorId is in the list (or if the list is
// empty / "all").

import type { Finding } from "./detectors/types.js";

export interface IgnoreInfo {
  // Lines (1-indexed) to suppress entirely (all detectors).
  fileWideAllLines: boolean;
  fileWideIds: Set<string>;
  // line -> set of detector IDs to suppress (or empty set = all).
  perLine: Map<number, Set<string>>;
  // Block ranges: [startLine, endLine] inclusive, with detector IDs.
  blocks: Array<{ start: number; end: number; ids: Set<string> }>;
}

const DIRECTIVE_RE =
  /(?:\/\/|#|\/\*+|\*)\s*agent-review-(ignore-next-line|ignore-line|ignore-file|disable|enable)\b([^*\n]*?)(?:\*\/|$)/i;

export function parseIgnoreDirectives(content: string): IgnoreInfo {
  const info: IgnoreInfo = {
    fileWideAllLines: false,
    fileWideIds: new Set<string>(),
    perLine: new Map(),
    blocks: [],
  };

  if (!content) return info;
  const lines = content.split("\n");

  // Track currently-active disable blocks (started by `disable`, ended by `enable`).
  const activeStack: Array<{ start: number; ids: Set<string> }> = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";
    const m = line.match(DIRECTIVE_RE);
    if (!m) continue;
    const kind = (m[1] ?? "").toLowerCase();
    const idsRaw = (m[2] ?? "").trim();
    const ids = parseIds(idsRaw);

    if (kind === "ignore-file") {
      if (ids.size === 0) info.fileWideAllLines = true;
      else for (const id of ids) info.fileWideIds.add(id);
    } else if (kind === "ignore-next-line") {
      mergeIds(info.perLine, lineNum + 1, ids);
    } else if (kind === "ignore-line") {
      mergeIds(info.perLine, lineNum, ids);
    } else if (kind === "disable") {
      activeStack.push({ start: lineNum, ids });
    } else if (kind === "enable") {
      const open = activeStack.pop();
      if (open) {
        info.blocks.push({ start: open.start, end: lineNum, ids: open.ids });
      }
    }
  }
  // Any unclosed disables run to the end of the file.
  for (const open of activeStack) {
    info.blocks.push({ start: open.start, end: lines.length, ids: open.ids });
  }
  return info;
}

function parseIds(raw: string): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  // Strip a leading `--` separator that some authors use (ESLint-style).
  const cleaned = raw.replace(/^\s*--\s*/, "");
  for (const part of cleaned.split(/[,\s]+/)) {
    const id = part.trim();
    if (!id) continue;
    if (id.toLowerCase() === "all") return new Set<string>(); // empty = all
    if (/^AR\d{3}$/i.test(id)) out.add(id.toUpperCase());
  }
  return out;
}

function mergeIds(map: Map<number, Set<string>>, line: number, ids: Set<string>): void {
  const existing = map.get(line);
  if (!existing) {
    map.set(line, ids);
    return;
  }
  // If either is empty (= all), the merged set is empty (= all).
  if (existing.size === 0 || ids.size === 0) {
    map.set(line, new Set<string>());
    return;
  }
  for (const id of ids) existing.add(id);
}

// Returns true if this finding is suppressed by an ignore directive.
export function isFindingIgnored(f: Finding, ignores: IgnoreInfo): boolean {
  if (ignores.fileWideAllLines) return true;
  if (ignores.fileWideIds.has(f.detectorId)) return true;

  const perLine = ignores.perLine.get(f.line);
  if (perLine) {
    if (perLine.size === 0) return true;
    if (perLine.has(f.detectorId)) return true;
  }

  for (const block of ignores.blocks) {
    if (f.line < block.start || f.line > block.end) continue;
    if (block.ids.size === 0) return true;
    if (block.ids.has(f.detectorId)) return true;
  }
  return false;
}

// Wires the ignore filter through the runner output.
export function applyIgnores(
  findings: Finding[],
  contentByPath: Map<string, string | undefined>
): { kept: Finding[]; suppressed: Finding[] } {
  const cache = new Map<string, IgnoreInfo>();
  const kept: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const f of findings) {
    let info = cache.get(f.file);
    if (!info) {
      info = parseIgnoreDirectives(contentByPath.get(f.file) ?? "");
      cache.set(f.file, info);
    }
    if (isFindingIgnored(f, info)) suppressed.push(f);
    else kept.push(f);
  }
  return { kept, suppressed };
}
