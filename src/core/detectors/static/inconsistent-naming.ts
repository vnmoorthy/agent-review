// AR014 — naming convention drift. The project's inferred convention is
// computed once in project.ts; here we flag added identifiers that violate
// it.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR014",
  category: "style-drift",
  title: "Inconsistent naming convention",
  applies: (ctx) => {
    if (!["ts", "tsx", "js", "jsx", "py"].includes(detectLang(ctx.filePath))) return false;
    // Skip generated/bundled files.
    if (/\.bundled_[a-z0-9]+\.(mjs|js|ts)$/.test(ctx.filePath)) return false;
    if (/\.config\.(ts|js|mjs|cjs)$/.test(ctx.filePath)) return false;
    return true;
  },
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (!ctx.newContent) return [];
    const conv =
      lang === "py" ? ctx.project.conventions.py : ctx.project.conventions.js;
    if (conv === "unknown" || conv === "mixed") return [];

    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      const candidate =
        lang === "py"
          ? text.match(/^\s*def\s+([A-Za-z_][\w]*)/)?.[1] ||
            text.match(/^\s*([a-z_][a-z0-9_]*)\s*=/)?.[1]
          : text.match(
              /^\s*(?:export\s+)?(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/
            )?.[1];
      if (!candidate) continue;
      // Constant-style ALL_CAPS is fine in either convention.
      if (/^[A-Z][A-Z0-9_]*$/.test(candidate)) continue;
      const looksCamel = /^[a-z][a-z0-9]*[A-Z]/.test(candidate);
      const looksSnake = /_/.test(candidate) && /^[a-z]/.test(candidate);
      if (conv === "camelCase" && looksSnake) {
        findings.push(buildFinding(ctx, ln, candidate, "camelCase"));
      } else if (conv === "snake_case" && looksCamel) {
        findings.push(buildFinding(ctx, ln, candidate, "snake_case"));
      }
    }
    return findings;
  },
};

function buildFinding(ctx: any, line: number, name: string, expected: string): Finding {
  return makeFinding("AR014", ctx, {
    line,
    endLine: line,
    message: `\`${name}\` doesn't follow the file's ${expected} convention.`,
    confidence: "low",
    suggestion: {
      kind: "text-only",
      text: `Rename to match ${expected} or move convention discussion to a separate PR.`,
    },
  });
}
