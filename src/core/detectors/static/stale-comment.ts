// AR009 — comment immediately above (or as docstring inside) a changed
// function references variable names that don't appear in the new function
// body.
//
// Static-only signal here (the LLM detector AR027 catches richer drift).

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR009",
  category: "drive-by",
  title: "Stale comment",
  applies: (ctx) => {
    const lang = detectLang(ctx.filePath);
    return ["ts", "tsx", "js", "jsx", "py"].includes(lang);
  },
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    const lang = detectLang(ctx.filePath);
    const isPy = lang === "py";

    for (let i = 0; i < lines.length; i++) {
      const fnLine = lines[i] ?? "";
      const fnMatch = isPy
        ? fnLine.match(/^\s*def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/)
        : fnLine.match(
            /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/
          );
      if (!fnMatch) continue;

      const fnName = fnMatch[1] ?? "";
      const params = (fnMatch[2] ?? "")
        .split(",")
        .map((p) => p.trim().replace(/[:=].*$/, "").trim())
        .filter(Boolean)
        .map((p) => p.replace(/^\.\.\./, ""));

      // Was this function touched in the diff?
      const fnTouched = lineRangeTouched(ctx.changedLines, i + 1, findEnd(lines, i));
      if (!fnTouched) continue;

      // Find the preceding comment block.
      const comment = isPy
        ? readPyDocstring(lines, i + 1)
        : readJsDocComment(lines, i);
      if (!comment) continue;

      // The names mentioned in the comment that look like identifiers.
      const referenced = Array.from(
        new Set((comment.text.match(/`[A-Za-z_$][\w$]*`/g) || []).map((m) => m.slice(1, -1)))
      );
      if (referenced.length === 0) continue;

      const body = lines.slice(i, findEnd(lines, i)).join("\n");
      const stale = referenced.filter((name) => {
        if (name === fnName) return false;
        if (params.includes(name)) return false;
        return !new RegExp(`\\b${escape(name)}\\b`).test(body);
      });
      if (stale.length === 0) continue;

      findings.push(
        makeFinding("AR009", ctx, {
          line: comment.line,
          endLine: comment.line,
          message: `Comment references \`${stale.join("`, `")}\` but the function body no longer mentions them.`,
          confidence: "low",
          suggestion: {
            kind: "text-only",
            text: "Update the comment/docstring to match the new behavior.",
          },
        })
      );
    }
    return findings;
  },
};

function readJsDocComment(
  lines: string[],
  fnLineIdx: number
): { line: number; text: string } | null {
  let idx = fnLineIdx - 1;
  while (idx >= 0 && (lines[idx] ?? "").trim() === "") idx--;
  if (idx < 0) return null;
  if (!(lines[idx] ?? "").trim().endsWith("*/")) {
    if ((lines[idx] ?? "").trim().startsWith("//")) {
      return { line: idx + 1, text: lines[idx] ?? "" };
    }
    return null;
  }
  let start = idx;
  while (start >= 0 && !(lines[start] ?? "").trim().startsWith("/*")) start--;
  if (start < 0) return null;
  return { line: start + 1, text: lines.slice(start, idx + 1).join("\n") };
}

function readPyDocstring(lines: string[], fnLineNum: number): { line: number; text: string } | null {
  // The docstring is the first triple-quoted string immediately after the
  // function declaration.
  let idx = fnLineNum;
  while (idx < lines.length && (lines[idx] ?? "").trim() === "") idx++;
  const first = (lines[idx] ?? "").trim();
  if (!first.startsWith('"""') && !first.startsWith("'''")) return null;
  // single-line docstring case
  if (first.length >= 6 && (first.endsWith('"""') || first.endsWith("'''")) && first !== '"""' && first !== "'''") {
    return { line: idx + 1, text: first };
  }
  let end = idx + 1;
  while (
    end < lines.length &&
    !(lines[end] ?? "").includes('"""') &&
    !(lines[end] ?? "").includes("'''")
  ) end++;
  return { line: idx + 1, text: lines.slice(idx, end + 1).join("\n") };
}

function findEnd(lines: string[], startIdx: number): number {
  // Heuristic: stop at next top-level decl or end of file.
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^(\s*)(?:export\s+)?(?:async\s+)?function\b/.test(l)) return i;
    if (/^\s*def\s+/.test(l)) return i;
  }
  return Math.min(lines.length, startIdx + 60);
}

function lineRangeTouched(
  changed: Set<number>,
  startLine: number,
  endLine: number
): boolean {
  for (let i = startLine; i <= endLine; i++) if (changed.has(i)) return true;
  return false;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
