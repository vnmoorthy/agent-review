// Shared utilities for static detectors.

import type { DetectorContext, Finding } from "./types.js";
import { getTaxonomyEntry } from "../taxonomy/registry.js";
import { snippetAround } from "../git/diff.js";

export function makeFinding(
  detectorId: string,
  ctx: DetectorContext,
  partial: Pick<Finding, "line" | "endLine" | "message"> &
    Partial<Pick<Finding, "severity" | "excerpt" | "suggestion" | "confidence" | "rationale">>
): Finding {
  const entry = getTaxonomyEntry(detectorId);
  if (!entry) {
    throw new Error(`Unknown detector id: ${detectorId}`);
  }
  return {
    detectorId,
    category: entry.category,
    title: entry.title,
    file: ctx.filePath,
    line: partial.line,
    endLine: partial.endLine,
    severity: partial.severity ?? entry.severity,
    message: partial.message,
    excerpt: partial.excerpt ?? snippetAround(ctx.newContent, partial.line, 3),
    suggestion: partial.suggestion,
    confidence: partial.confidence ?? "medium",
    rationale: partial.rationale,
  };
}

// Given the full new content, return the lines as a 1-indexed array (index 0 is empty).
export function lines1(content: string | undefined): string[] {
  const arr = (content ?? "").split("\n");
  return ["", ...arr];
}

// Get all lines added in the diff (as 1-indexed numbers, sorted).
export function addedLineNumbers(ctx: DetectorContext): number[] {
  const arr = Array.from(ctx.fileDiff.addedLines.values());
  arr.sort((a, b) => a - b);
  return arr;
}

// Inspect the added lines and return only those that match a predicate.
export function addedLinesMatching(
  ctx: DetectorContext,
  pred: (line: string, lineNumber: number) => boolean
): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const all = lines1(ctx.newContent);
  for (const ln of addedLineNumbers(ctx)) {
    const text = all[ln] ?? "";
    if (pred(text, ln)) out.push({ line: ln, text });
  }
  return out;
}

// Identify the indent level (number of leading spaces) of a line.
export function indentOf(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  return i;
}

// Strip line-level comments based on heuristic per language.
export function stripLineComment(line: string, lang: string): string {
  if (lang === "py") {
    const idx = line.indexOf("#");
    return idx >= 0 ? line.slice(0, idx) : line;
  }
  // TS/JS/Go/Rust all use //.
  const idx = line.indexOf("//");
  return idx >= 0 ? line.slice(0, idx) : line;
}

// True if the line is entirely a comment (ignoring leading whitespace).
export function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*");
}

// True if the line appears to be inside a string literal at the given column.
// We use a coarse parity check on quote characters.
export function inStringAt(line: string, col: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < col && i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (prev === "\\") continue;
    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

// True if the line is a detector source file or other internal file that's
// allowed to mention the patterns we look for.
export function isDetectorSourceFile(path: string): boolean {
  return (
    path.includes("/core/detectors/") ||
    path.includes("/taxonomy/registry") ||
    path.includes("/core/llm/prompts/") ||
    path.endsWith("TAXONOMY.md") ||
    path.endsWith("README.md")
  );
}

// Heuristic: does this comment line look like commented-out code?
export function looksLikeCommentedOutCode(line: string): boolean {
  const m = line.match(/^\s*(\/\/|#)\s*(.*)$/);
  if (!m) return false;
  const body = (m[2] ?? "").trim();
  if (body.length < 6) return false;
  if (/^[A-Z][^.!?]*[.!?]?$/.test(body) && body.split(" ").length < 12) return false;
  // Code-ish signals.
  let score = 0;
  if (body.includes("(") && body.includes(")")) score += 2;
  if (body.includes("=") && !body.startsWith("=")) score += 2;
  if (body.endsWith(";")) score += 2;
  if (body.endsWith("{") || body.startsWith("}")) score += 2;
  if (/\bfunction\b|\bdef\b|\bconst\b|\blet\b|\bvar\b|\bclass\b|\bif\b|\breturn\b/.test(body))
    score += 3;
  if (/^\s*[a-zA-Z_$][\w$]*\s*\(/.test(body)) score += 2;
  return score >= 4;
}

// Returns true if the path ends in any of the given extensions.
export function hasExt(path: string, exts: string[]): boolean {
  return exts.some((e) => path.endsWith(e));
}

// True if this token appears literally in the content.
export function contentReferences(content: string | undefined, name: string): boolean {
  if (!content || !name) return false;
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`);
  return re.test(content);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Count references of an identifier across content (ignoring its declaration line if provided).
export function countReferences(
  content: string | undefined,
  name: string,
  ignoreLine?: number
): number {
  if (!content || !name) return 0;
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
  let count = 0;
  const lines = (content ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (ignoreLine !== undefined && i + 1 === ignoreLine) continue;
    const matches = (lines[i] ?? "").match(re);
    if (matches) count += matches.length;
  }
  return count;
}
