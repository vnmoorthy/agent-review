// AR013 — TODO/FIXME/XXX/HACK comments added in this diff.

import type { Detector, Finding } from "../types.js";
import { isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, isDetectorSourceFile, makeFinding } from "../helpers.js";

const TOKEN_RE = /\b(TODO|FIXME|XXX|HACK)\b/;

export const detector: Detector = {
  id: "AR013",
  category: "drive-by",
  title: "TODO/FIXME introduced",
  applies: (ctx) =>
    isLanguageFile(ctx.filePath) && !!ctx.newContent && !isDetectorSourceFile(ctx.filePath),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      if (!/^\s*(?:\/\/|#|\*|\/\*)/.test(text)) continue;
      const m = text.match(TOKEN_RE);
      if (!m) continue;
      const tag = m[1] ?? "TODO";
      findings.push(
        makeFinding("AR013", ctx, {
          line: ln,
          endLine: ln,
          message: `${tag} comment introduced. Surface or resolve before shipping.`,
          confidence: "high",
          suggestion: {
            kind: "text-only",
            text: "Either complete the work, file an issue and reference it, or remove the comment.",
          },
        })
      );
    }
    return findings;
  },
};
