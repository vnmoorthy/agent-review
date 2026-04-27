// AR020 — numeric literal introduced in a context that previously used a
// named constant for the same domain.

import type { Detector, Finding } from "../types.js";
import { isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

const TRIVIAL = new Set([0, 1, -1, 2, 100, 200, 1000]);

export const detector: Detector = {
  id: "AR020",
  category: "drive-by",
  title: "Magic number introduced",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");
    // Build a map of constants we recognize from the new file.
    const constMap = new Map<string, string>(); // value -> name
    const constRe = /^\s*(?:export\s+)?(?:const|let|var)?\s*([A-Z][A-Z0-9_]+)\s*=\s*(\d+)/;
    for (const l of lines) {
      const m = (l ?? "").match(constRe);
      if (m) constMap.set(m[2] ?? "", m[1] ?? "");
    }
    if (constMap.size === 0) return [];

    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      if (/^\s*(?:export\s+)?(?:const|let|var)\s+[A-Z]/.test(text)) continue;
      const numbers = text.match(/\b\d{2,}\b/g) ?? [];
      for (const num of numbers) {
        if (TRIVIAL.has(Number(num))) continue;
        if (constMap.has(num)) {
          const name = constMap.get(num);
          findings.push(
            makeFinding("AR020", ctx, {
              line: ln,
              endLine: ln,
              message: `Numeric literal \`${num}\` could use the existing constant \`${name}\`.`,
              confidence: "medium",
              suggestion: {
                kind: "text-only",
                text: `Replace literal \`${num}\` with \`${name}\`.`,
              },
            })
          );
        }
      }
    }
    return findings;
  },
};
