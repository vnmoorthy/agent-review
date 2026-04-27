// AR012 — debug print statements introduced in non-test source files.

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile, isTestFile } from "../../git/files.js";
import { addedLineNumbers, isCommentLine, isDetectorSourceFile, makeFinding } from "../helpers.js";

const PATTERNS: Record<string, RegExp[]> = {
  js: [/\bconsole\.(log|debug|trace)\s*\(/, /\bdebugger\b/],
  ts: [/\bconsole\.(log|debug|trace)\s*\(/, /\bdebugger\b/],
  tsx: [/\bconsole\.(log|debug|trace)\s*\(/, /\bdebugger\b/],
  jsx: [/\bconsole\.(log|debug|trace)\s*\(/, /\bdebugger\b/],
  py: [/^\s*print\s*\(/m, /\bbreakpoint\s*\(\s*\)/],
  go: [/\bfmt\.Println\s*\(/, /\bfmt\.Printf\s*\(/],
  rust: [/\bdbg!\s*\(/, /\beprintln!\s*\(/, /\bprintln!\s*\(/],
};

export const detector: Detector = {
  id: "AR012",
  category: "drive-by",
  title: "Debug print left behind",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !isTestFile(ctx.filePath),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lang = detectLang(ctx.filePath);
    const patterns = PATTERNS[lang];
    if (!patterns) return [];
    // Skip CLI/main scripts where prints are intended output.
    if (
      ctx.filePath.includes("/bin/") ||
      /(^|\/)(cli|main)\.(ts|js|py|go|rs)$/.test(ctx.filePath) ||
      ctx.filePath.startsWith("scripts/") ||
      ctx.filePath.includes("/cli/") ||
      isDetectorSourceFile(ctx.filePath)
    ) {
      return [];
    }
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      if (isCommentLine(text)) continue;
      // Skip if the match is inside a string literal.
      if (/["'`].*console\.(log|debug|trace).*["'`]/.test(text)) continue;
      for (const p of patterns) {
        if (p.test(text)) {
          findings.push(
            makeFinding("AR012", ctx, {
              line: ln,
              endLine: ln,
              message: "Debug print statement left in non-test code.",
              confidence: "high",
              suggestion: {
                kind: "remove-lines",
                startLine: ln,
                endLine: ln,
              },
            })
          );
          break;
        }
      }
    }
    return findings;
  },
};
