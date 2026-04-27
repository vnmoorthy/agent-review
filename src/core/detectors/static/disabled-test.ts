// AR025 — disabled or skipped test.

import type { Detector, Finding } from "../types.js";
import { isTestFile } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

const PATTERNS: RegExp[] = [
  /\b(?:it|test|describe)\s*\.\s*skip\s*\(/,
  /\bxit\s*\(/,
  /\bxdescribe\s*\(/,
  /@pytest\.mark\.skip\b/,
  /@unittest\.skip\b/,
  /\bt\.Skip\s*\(/, // Go testing
  /#\[ignore\]/, // Rust
];

export const detector: Detector = {
  id: "AR025",
  category: "test-quality",
  title: "Disabled or skipped test",
  applies: (ctx) => isTestFile(ctx.filePath),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      // Skip when the match is inside a string literal (e.g., test fixtures).
      if (/['"`].*(it|test|describe)\.skip.*['"`]/.test(text)) continue;
      if (/['"`].*xit\s*\(.*['"`]/.test(text)) continue;
      if (PATTERNS.some((p) => p.test(text))) {
        findings.push(
          makeFinding("AR025", ctx, {
            line: ln,
            endLine: ln,
            message: "Test was skipped/disabled. Make sure that's intentional and tracked.",
            confidence: "high",
            suggestion: {
              kind: "text-only",
              text: "Re-enable the test, or open a tracking issue and reference it from a comment.",
            },
          })
        );
      }
    }
    return findings;
  },
};
