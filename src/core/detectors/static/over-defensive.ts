// AR008 — null/undefined check on a value the surrounding code already
// guarantees is non-null.
//
// Heuristic detection (no full type analysis):
//   - Find an added line of the form `if (!x)` or `if (x == null)` etc.
//   - The previous non-blank line in the function assigns x via
//     `const x = literal | new ... | something not null-typed`.
// We only fire on `const`/`let` assignments where the RHS is one of:
//   string/number literal, array literal, object literal, `new X(`,
//   `[].map(`, etc.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR008",
  category: "drive-by",
  title: "Over-defensive null check",
  applies: (ctx) => {
    const lang = detectLang(ctx.filePath);
    return lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx";
  },
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      const m = text.match(
        /\bif\s*\(\s*!?([A-Za-z_$][\w$]*)\s*(?:===|!==|==|!=)?\s*(?:null|undefined)?\s*\)/
      );
      if (!m) {
        const m2 = text.match(/\bif\s*\(\s*!\s*([A-Za-z_$][\w$]*)\s*\)/);
        if (!m2) continue;
        const ident = m2[1];
        if (!ident) continue;
        if (priorAssignmentNonNull(lines, ln, ident)) {
          findings.push(buildFinding(ctx, ln, ident));
        }
        continue;
      }
      const ident = m[1];
      if (!ident) continue;
      if (priorAssignmentNonNull(lines, ln, ident)) {
        findings.push(buildFinding(ctx, ln, ident));
      }
    }
    return findings;
  },
};

function buildFinding(ctx: any, ln: number, ident: string): Finding {
  return makeFinding("AR008", ctx, {
    line: ln,
    endLine: ln,
    message: `\`${ident}\` was just assigned a non-nullable value; this null check is unnecessary.`,
    confidence: "low",
    suggestion: {
      kind: "text-only",
      text: `Drop the redundant null check, or add a comment explaining the actual concern.`,
    },
  });
}

function priorAssignmentNonNull(
  lines: string[],
  fromLine: number,
  ident: string
): boolean {
  // Look back for a const/let/var declaration. Bail out if we encounter any
  // reassignment of `ident` between the declaration and `fromLine`.
  const reassignRe = new RegExp(`(?<![\\w.])${escape(ident)}\\s*=\\s*[^=]`);
  for (let i = fromLine - 2; i >= 0 && i >= fromLine - 8; i--) {
    const l = (lines[i] ?? "").trim();
    if (!l) continue;
    // If we see a reassignment first, the prior declaration is no longer authoritative.
    if (reassignRe.test(l) && !new RegExp(`^(?:const|let|var)\\s+${escape(ident)}\\b`).test(l)) {
      return false;
    }
    const re = new RegExp(`^(?:const|let|var)\\s+${escape(ident)}\\b\\s*=\\s*(.*)$`);
    const m = l.match(re);
    if (!m) continue;
    const rhs = (m[1] ?? "").trim();
    if (!rhs) return false;
    // `let x = false;` does NOT prove non-null beyond mutation; skip.
    if (/^true\b|^false\b/.test(rhs) && /^let\b/.test(l)) return false;
    if (
      /^["'`]/.test(rhs) ||
      /^\d/.test(rhs) ||
      /^\[/.test(rhs) ||
      /^\{/.test(rhs) ||
      /^new\s+[A-Z]/.test(rhs) ||
      /\.map\(/.test(rhs) ||
      /\.filter\(/.test(rhs)
    ) {
      return true;
    }
    return false;
  }
  return false;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
