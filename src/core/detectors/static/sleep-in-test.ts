// AR021 — sleeps introduced in test files.

import type { Detector, Finding } from "../types.js";
import { isTestFile, detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

const PATTERNS: Record<string, RegExp[]> = {
  ts: [/setTimeout\s*\(/, /\bawait\s+sleep\s*\(/, /\bnew\s+Promise\s*\([^)]*setTimeout/],
  tsx: [/setTimeout\s*\(/, /\bawait\s+sleep\s*\(/, /\bnew\s+Promise\s*\([^)]*setTimeout/],
  js: [/setTimeout\s*\(/, /\bawait\s+sleep\s*\(/, /\bnew\s+Promise\s*\([^)]*setTimeout/],
  jsx: [/setTimeout\s*\(/, /\bawait\s+sleep\s*\(/, /\bnew\s+Promise\s*\([^)]*setTimeout/],
  py: [/\btime\.sleep\s*\(/, /\basyncio\.sleep\s*\(/],
  go: [/\btime\.Sleep\s*\(/],
  rust: [/std::thread::sleep/, /tokio::time::sleep/],
};

export const detector: Detector = {
  id: "AR021",
  category: "test-quality",
  title: "Sleep in test",
  applies: (ctx) => isTestFile(ctx.filePath),
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    const patterns = PATTERNS[lang];
    if (!patterns) return [];
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      // Skip lines that look like fixture strings (sleep call inside a quoted block).
      if (/['"`].*setTimeout.*['"`]/.test(text)) continue;
      if (/['"`].*time\.sleep.*['"`]/.test(text)) continue;
      if (patterns.some((p) => p.test(text))) {
        findings.push(
          makeFinding("AR021", ctx, {
            line: ln,
            endLine: ln,
            message: "Sleep in tests is flaky. Wait for the real signal instead.",
            confidence: "high",
            suggestion: {
              kind: "text-only",
              text: "Use waitFor / polling / event subscription instead of a fixed sleep.",
            },
          })
        );
      }
    }
    return findings;
  },
};
