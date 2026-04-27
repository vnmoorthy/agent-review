// AR023 — function parameter object mutated when the codebase convention is
// immutability.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { makeFinding } from "../helpers.js";
import { findBraceEnd } from "../brace-walker.js";

export const detector: Detector = {
  id: "AR023",
  category: "safety",
  title: "Mutated input parameter",
  applies: (ctx) => ["ts", "tsx", "js", "jsx"].includes(detectLang(ctx.filePath)),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];

    // Require strong immutability signals: explicit `readonly`, `Object.freeze`,
    // or `Readonly<...>` types. Generic functional helpers like `.map` aren't
    // strong enough — many mutating codebases use them too.
    const strongImmutableSignal =
      /\bObject\.freeze\s*\(/.test(ctx.newContent) ||
      /\breadonly\s+[A-Za-z_$]/.test(ctx.newContent) ||
      /:\s*Readonly</.test(ctx.newContent) ||
      /:\s*ReadonlyArray</.test(ctx.newContent);
    if (!strongImmutableSignal) return [];

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      const fnMatch = text.match(
        /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/
      );
      if (!fnMatch) continue;
      const params = (fnMatch[1] ?? "")
        .split(",")
        .map((p) => p.trim().split(/[:=]/)[0]?.trim() ?? "")
        .filter(Boolean);
      if (params.length === 0) continue;
      const start = i;
      const end = findBraceEnd(lines, i);
      for (let j = start + 1; j <= end; j++) {
        const ln = j + 1;
        if (!ctx.changedLines.has(ln)) continue;
        const body = lines[j] ?? "";
        for (const p of params) {
          if (
            new RegExp(`\\b${escape(p)}\\.[A-Za-z_$][\\w$]*\\s*=\\s*[^=]`).test(body) ||
            new RegExp(`\\bObject\\.assign\\s*\\(\\s*${escape(p)}\\s*,`).test(body) ||
            new RegExp(`\\b${escape(p)}\\.push\\s*\\(`).test(body) ||
            new RegExp(`\\b${escape(p)}\\.splice\\s*\\(`).test(body)
          ) {
            findings.push(
              makeFinding("AR023", ctx, {
                line: ln,
                endLine: ln,
                message: `Parameter \`${p}\` is mutated; the surrounding code style is immutable.`,
                confidence: "low",
                suggestion: {
                  kind: "text-only",
                  text: `Return a new value instead of mutating \`${p}\`.`,
                },
              })
            );
          }
        }
      }
    }
    return findings;
  },
};

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
