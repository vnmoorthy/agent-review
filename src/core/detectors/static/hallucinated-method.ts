// AR006 — method called on a known stdlib type that doesn't exist on it.
// We use a curated dictionary of "looks plausible but doesn't exist" pairs.
// Specifically aimed at the cross-language confusions agents produce most.

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, isCommentLine, isDetectorSourceFile, makeFinding } from "../helpers.js";

interface FakeApi {
  pattern: RegExp;
  message: string;
  langs: string[];
}

// These are real things agents output that don't exist.
const FAKE_APIS: FakeApi[] = [
  // JS/TS
  {
    pattern: /\.contains\s*\(/,
    message: "JS arrays/strings have `.includes`, not `.contains`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\.removeAll\s*\(/,
    message: "JS arrays have no `.removeAll`. Use `.filter` or `.length = 0`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\bArray\.from\s*\([^)]*\)\.removeIf\s*\(/,
    message: "JS arrays have no `.removeIf`. Use `.filter`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /Object\.has\s*\(/,
    message: "JS has `Object.hasOwn`, not `Object.has`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\bArray\.containsAll\s*\(/,
    message: "JS arrays have no `.containsAll`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\.toArray\s*\(\s*\)/,
    message: "Plain JS arrays/Sets don't have `.toArray()` on themselves; use `Array.from()`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\bMap\.fromEntries\s*\(/,
    message: "JS Map has no `Map.fromEntries`. Use `new Map(entries)` or `Object.fromEntries`.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  {
    pattern: /\bsetTimeout\s*\([^,]+,\s*[^,]+,\s*\.\.\.\s*\w+\s*\)/,
    message: "Suspicious setTimeout signature.",
    langs: ["ts", "tsx", "js", "jsx"],
  },
  // Python
  {
    pattern: /\.contains\s*\(/,
    message: "Python strings/sequences use `in`, not `.contains()`.",
    langs: ["py"],
  },
  {
    pattern: /\.length\s*\(/,
    message: "Python uses `len(x)`, not `x.length()`.",
    langs: ["py"],
  },
  {
    pattern: /\.size\s*\(\s*\)/,
    message: "Python uses `len(x)`, not `x.size()`.",
    langs: ["py"],
  },
  {
    pattern: /list\.add\s*\(/,
    message: "Python list uses `.append`, not `.add`.",
    langs: ["py"],
  },
  {
    pattern: /str\.contains\s*\(/,
    message: "Python str has no `.contains`. Use `in`.",
    langs: ["py"],
  },
  // Go
  {
    pattern: /strings\.Contains\(\s*"[^"]*",\s*nil\s*\)/,
    message: "strings.Contains expects a string substring, not nil.",
    langs: ["go"],
  },
  {
    pattern: /\.Length\s*\(\s*\)/,
    message: "Go uses `len(x)`, not `x.Length()`.",
    langs: ["go"],
  },
  // Rust
  {
    pattern: /\.unwrap_or_panic\s*\(/,
    message: "Rust has `.unwrap()` and `.expect()`, not `.unwrap_or_panic()`.",
    langs: ["rust"],
  },
];

export const detector: Detector = {
  id: "AR006",
  category: "hallucination",
  title: "Hallucinated method or property",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (isDetectorSourceFile(ctx.filePath)) return [];
    // Skip test files that embed string fixtures of bad code.
    if (/(^|\/)(test|tests|__tests__)\//.test(ctx.filePath)) return [];
    if (/\.(test|spec)\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(ctx.filePath)) return [];
    const findings: Finding[] = [];
    const newLines = (ctx.newContent ?? "").split("\n");
    for (const ln of addedLineNumbers(ctx)) {
      const text = newLines[ln - 1] ?? "";
      if (!text.trim()) continue;
      if (isCommentLine(text)) continue;
      // Skip lines that look like regex literals (contain `/.../`).
      if (/=\s*\/.+\/[gimsuy]*\s*[,;]?\s*$/.test(text)) continue;
      // Skip when the match is clearly inside a string.
      if (/['"`].*\.contains\s*\(.*['"`]/.test(text)) continue;
      for (const api of FAKE_APIS) {
        if (!api.langs.includes(lang)) continue;
        if (api.pattern.test(text)) {
          findings.push(
            makeFinding("AR006", ctx, {
              line: ln,
              endLine: ln,
              message: api.message,
              confidence: "high",
              suggestion: { kind: "text-only", text: api.message },
            })
          );
        }
      }
    }
    return findings;
  },
};
