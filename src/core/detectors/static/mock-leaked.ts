// AR011 — mock/fixture identifiers leaked into non-test files.

import type { Detector, Finding } from "../types.js";
import { isTestFile, isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, isDetectorSourceFile, makeFinding } from "../helpers.js";

const MOCK_PATTERNS: Array<{ re: RegExp; msg: string }> = [
  { re: /\bmock[A-Z][\w]*\b/, msg: "References a `mockXxx` identifier" },
  { re: /\bfake[A-Z][\w]*\b/, msg: "References a `fakeXxx` identifier" },
  { re: /\bdummy[A-Z][\w]*\b/, msg: "References a `dummyXxx` identifier" },
  { re: /\bstub[A-Z][\w]*\b/, msg: "References a `stubXxx` identifier" },
  { re: /TODO_REPLACE\b|REPLACE_ME\b|XXX_REPLACE\b/, msg: "Placeholder marker `TODO_REPLACE`" },
  { re: /\bplaceholder[A-Z][\w]*\b/, msg: "References a `placeholderXxx` identifier" },
  { re: /https?:\/\/(?:mock|fake|stub|placeholder)[a-z0-9.-]*/i, msg: "Mock/placeholder URL" },
  { re: /['"]mock-[a-z0-9-]+['"]/i, msg: "Mock string literal" },
];

export const detector: Detector = {
  id: "AR011",
  category: "safety",
  title: "Mock leaked into production code",
  applies: (ctx) =>
    isLanguageFile(ctx.filePath) &&
    !isTestFile(ctx.filePath) &&
    !isDetectorSourceFile(ctx.filePath),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      // Skip comment lines.
      if (/^\s*(?:\/\/|#)/.test(text)) continue;
      for (const p of MOCK_PATTERNS) {
        if (p.re.test(text)) {
          findings.push(
            makeFinding("AR011", ctx, {
              line: ln,
              endLine: ln,
              message: `${p.msg} in non-test code.`,
              confidence: "medium",
              suggestion: {
                kind: "text-only",
                text: "Replace with the real value or move to a test file.",
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
