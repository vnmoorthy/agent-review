// AR017 — try/catch where the catch body is empty, only re-throws, or only
// logs without surfacing.

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, isDetectorSourceFile, makeFinding } from "../helpers.js";
import { findBraceEnd, findPyBlockEnd } from "../brace-walker.js";

export const detector: Detector = {
  id: "AR017",
  category: "safety",
  title: "Silent or swallowed catch",
  applies: (ctx) =>
    isLanguageFile(ctx.filePath) &&
    !!ctx.newContent &&
    !isDetectorSourceFile(ctx.filePath) &&
    !/(^|\/)(test|tests|__tests__)\//.test(ctx.filePath) &&
    !/\.(test|spec)\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(ctx.filePath),
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];

    const isPy = lang === "py";
    const added = new Set(addedLineNumbers(ctx));

    // First pass: one-line catches like `} catch (e) { }` or `catch (e) { only-log }`.
    if (!isPy) {
      const oneLineRe = /\bcatch\s*\(?[\w$:\s,]*\)?\s*\{([^}]*)\}/g;
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i] ?? "";
        const ln = i + 1;
        if (!added.has(ln)) continue;
        let m: RegExpExecArray | null;
        oneLineRe.lastIndex = 0;
        while ((m = oneLineRe.exec(text))) {
          const body = (m[1] ?? "").trim();
          if (isSwallowedBody(body)) {
            findings.push(buildFinding(ctx, ln));
            break;
          }
        }
      }
    }

    // Second pass: multi-line catches.
    const catchRe = isPy ? /^\s*except\b[^:]*:\s*$/ : /^\s*}?\s*catch\s*\(?[\w$:\s,]*\)?\s*\{\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (!catchRe.test(text)) continue;
      const start = i + 1;
      const bodyEnd = isPy ? findPyBlockEnd(lines, i) : findBraceEnd(lines, i);
      const bodyLines = lines.slice(i + 1, bodyEnd).map((l) => (l ?? "").trim()).filter(Boolean);
      if (!added.has(start) && !bodyLines.some((_, j) => added.has(start + 1 + j))) continue;

      const body = bodyLines.join(" ");
      if (!isSwallowedBody(body) && !(bodyLines.length === 1 && isSwallowedBody(bodyLines[0] ?? "")))
        continue;
      findings.push(buildFinding(ctx, start));
    }
    return findings;
  },
};

function buildFinding(ctx: any, line: number): Finding {
  return makeFinding("AR017", ctx, {
    line,
    endLine: line,
    message: `Catch block silently swallows the error.`,
    confidence: "high",
    suggestion: {
      kind: "text-only",
      text: "Re-throw, surface to the caller, or annotate why this error is intentionally ignored.",
    },
  });
}

function isSwallowedBody(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed === "") return true;
  if (trimmed === "}") return true;
  // If the body contains a comment with "intentional" / "expected" / etc., the
  // author has explicitly annotated this catch — trust them.
  if (/(?:\/\/|#).*(?:intentional|expected|ok\b|fine|ignored?\s+by|safe)/i.test(trimmed))
    return false;
  // Single bare comment with no explanation = swallow.
  if (/^(?:\/\/|#)\s*(swallow|ignore|empty|noop|no[ -]op|todo)?\s*[}]?\s*$/i.test(trimmed))
    return true;
  if (/^pass\s*$/.test(trimmed)) return true;
  if (/^return\s*(?:null|undefined|None|nil|;)?\s*$/.test(trimmed)) return true;
  if (/^console\.(log|error|warn)\s*\(/.test(trimmed) && !trimmed.includes(";")) return true;
  return false;
}
