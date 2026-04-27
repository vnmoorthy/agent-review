// AR019 — broad exception catch where narrower handlers existed before.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR019",
  category: "safety",
  title: "Broad exception catch",
  applies: (ctx) => ["py", "ts", "tsx", "js", "jsx"].includes(detectLang(ctx.filePath)),
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");

    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      if (lang === "py") {
        if (
          /^\s*except\s*:\s*$/.test(text) ||
          /^\s*except\s+(?:Exception|BaseException)\s*[:as]/.test(text)
        ) {
          findings.push(buildFinding(ctx, ln, "Python broad except"));
        }
      } else {
        if (/^\s*}?\s*catch\s*\(\s*[A-Za-z_$][\w$]*\s*(?::\s*any)?\s*\)\s*\{/.test(text)) {
          // Narrow it: only flag if the previous version of this file had a typed catch.
          if (
            ctx.oldContent &&
            /catch\s*\(\s*[A-Za-z_$][\w$]*\s*:\s*[A-Z]\w*/.test(ctx.oldContent)
          ) {
            findings.push(buildFinding(ctx, ln, "Catch widened from typed to untyped"));
          }
        }
      }
    }
    return findings;
  },
};

function buildFinding(ctx: any, line: number, what: string): Finding {
  return makeFinding("AR019", ctx, {
    line,
    endLine: line,
    message: `${what}: prefer catching the specific error type so unrelated bugs aren't masked.`,
    confidence: "medium",
    suggestion: {
      kind: "text-only",
      text: "Catch the narrowest exception type that the operation can actually raise.",
    },
  });
}
