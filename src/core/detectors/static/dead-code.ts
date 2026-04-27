// AR001 — function/variable added in this diff that is not referenced in
// the new content of the file or any other file in the diff.
//
// We only fire on definitions that were *added* in the diff (i.e. their
// declaration line appears in fileDiff.addedLines). To avoid false positives
// we only consider top-level declarations and exported items are explicitly
// suppressed unless they're orphaned in another sense (handled by AR016).

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";
import { findBraceEnd, findPyBlockEnd } from "../brace-walker.js";

const DECLARATION_PATTERNS: Array<{
  re: RegExp;
  // capture group with the identifier
  group: number;
  langs: Array<"ts" | "js" | "tsx" | "jsx" | "py" | "go" | "rust">;
  exported?: RegExp;
}> = [
  // JS/TS function declaration: function foo(
  {
    re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    group: 1,
    langs: ["ts", "tsx", "js", "jsx"],
    exported: /^\s*export\s+/,
  },
  // const foo = (...) =>  | const foo = function
  {
    re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\s*\(|\(.*\)\s*=>)/,
    group: 1,
    langs: ["ts", "tsx", "js", "jsx"],
    exported: /^\s*export\s+/,
  },
  // Python function/class
  {
    re: /^\s*def\s+([A-Za-z_][\w]*)\s*\(/,
    group: 1,
    langs: ["py"],
  },
  {
    re: /^\s*class\s+([A-Za-z_][\w]*)\s*[(:]/,
    group: 1,
    langs: ["py"],
  },
  // Go: func Name(  / func (r Recv) Name(
  {
    re: /^\s*func\s+(?:\([^)]*\)\s+)?([A-Za-z_][\w]*)\s*\(/,
    group: 1,
    langs: ["go"],
  },
  // Rust: fn name(
  {
    re: /^\s*(?:pub\s+(?:\([^)]+\)\s+)?)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*[<(]/,
    group: 1,
    langs: ["rust"],
  },
];

export const detector: Detector = {
  id: "AR001",
  category: "dead-code",
  title: "Dead code introduced",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (lang === "other") return [];
    const findings: Finding[] = [];
    const newLines = (ctx.newContent ?? "").split("\n");

    const seen = new Set<string>();
    for (const ln of addedLineNumbers(ctx)) {
      const text = newLines[ln - 1] ?? "";
      for (const pat of DECLARATION_PATTERNS) {
        if (!pat.langs.includes(lang as any)) continue;
        const match = text.match(pat.re);
        if (!match) continue;
        const name = match[pat.group];
        if (!name || seen.has(name)) continue;
        seen.add(name);

        // Skip if exported (consumers may live in other files we can't see).
        if (pat.exported && pat.exported.test(text)) continue;
        // Skip "main" functions etc.
        if (["main", "_", "__init__", "__main__"].includes(name)) continue;

        // Count references in the new content. We exclude the declaration line.
        const refCount = countReferencesAcrossDiff(ctx, name, ln);
        if (refCount > 0) continue;

        // Compute the function's full extent for the suggestion.
        let endLine = ln;
        if (lang === "py") {
          endLine = findPyBlockEnd(newLines, ln - 1);
        } else if (text.includes("{")) {
          endLine = findBraceEnd(newLines, ln - 1) + 1;
        }
        findings.push(
          makeFinding("AR001", ctx, {
            line: ln,
            endLine,
            message: `\`${name}\` is defined but never referenced.`,
            confidence: "medium",
            suggestion: {
              kind: "text-only",
              text: `Remove \`${name}\` if it isn't needed, or surface a call site.`,
            },
          })
        );
      }
    }
    return findings;
  },
};

function countReferencesAcrossDiff(
  ctx: { newContent?: string; diff: { files: Array<{ newContent?: string; path: string }> }; filePath: string },
  name: string,
  declLine: number
): number {
  let count = 0;
  // Same file (excluding declaration line).
  const localLines = (ctx.newContent ?? "").split("\n");
  for (let i = 0; i < localLines.length; i++) {
    if (i + 1 === declLine) continue;
    const ln = localLines[i] ?? "";
    if (new RegExp(`\\b${escape(name)}\\b`).test(ln)) count++;
  }
  // Other files in the diff.
  for (const f of ctx.diff.files) {
    if (f.path === ctx.filePath) continue;
    if (!f.newContent) continue;
    if (new RegExp(`\\b${escape(name)}\\b`).test(f.newContent)) count++;
  }
  return count;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
