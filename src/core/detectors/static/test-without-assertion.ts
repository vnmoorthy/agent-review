// AR010 — `it/test/describe` block (or Python equivalent) added without any
// assertion call inside.

import type { Detector, Finding } from "../types.js";
import { isTestFile, detectLang } from "../../git/files.js";
import { makeFinding } from "../helpers.js";
import { findBraceEnd, findPyBlockEnd } from "../brace-walker.js";

const ASSERT_TOKENS_JS = [
  "expect(",
  "assert(",
  ".toBe(",
  ".toEqual(",
  ".toMatch(",
  ".toThrow(",
  ".toContain(",
  ".toHaveBeenCalled",
  ".toBeTruthy(",
  ".toBeFalsy(",
  ".toBeNull(",
  ".toBeDefined(",
  "should.",
  "chai.",
];

const ASSERT_TOKENS_PY = [
  "assert ",
  "self.assert",
  "self.fail(",
  "pytest.fail(",
  "pytest.raises(",
];

export const detector: Detector = {
  id: "AR010",
  category: "test-quality",
  title: "Test without assertion",
  applies: (ctx) => isTestFile(ctx.filePath),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lang = detectLang(ctx.filePath);
    const lines = ctx.newContent.split("\n");
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      if (!ctx.changedLines.has(ln)) continue;
      const text = lines[i] ?? "";

      let isTest = false;
      let testKindLength = 0;

      if (lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx") {
        if (/^\s*(it|test)\s*\(\s*['"`]/.test(text)) {
          isTest = true;
        }
      } else if (lang === "py") {
        if (/^\s*def\s+test_[A-Za-z_0-9]*\s*\(/.test(text)) {
          isTest = true;
        }
      }
      if (!isTest) continue;

      // Find the block range.
      const end = lang === "py" ? findPyBlockEnd(lines, i) : findBraceEnd(lines, i);
      const body = lines.slice(i, end + 1).join("\n");
      testKindLength = end - i;

      const tokens = lang === "py" ? ASSERT_TOKENS_PY : ASSERT_TOKENS_JS;
      const has = tokens.some((t) => body.includes(t));
      if (has) continue;
      if (testKindLength < 2) continue;

      findings.push(
        makeFinding("AR010", ctx, {
          line: ln,
          endLine: ln,
          message: "This test block contains no assertion.",
          confidence: "high",
          suggestion: {
            kind: "text-only",
            text: "Add an `expect(...)` / `assert ...` call, or remove the test.",
          },
        })
      );
    }
    return findings;
  },
};

