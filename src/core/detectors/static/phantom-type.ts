// AR007 — TypeScript type alias or interface declared in this diff and
// never referenced anywhere in the file or other files in the diff.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";
import { findBraceEnd } from "../brace-walker.js";

export const detector: Detector = {
  id: "AR007",
  category: "dead-code",
  title: "Phantom type or interface",
  applies: (ctx) => {
    const lang = detectLang(ctx.filePath);
    return lang === "ts" || lang === "tsx";
  },
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      const m =
        text.match(/^\s*(?:export\s+)?type\s+([A-Z][\w]*)\s*=/) ||
        text.match(/^\s*(?:export\s+)?interface\s+([A-Z][\w]*)/);
      if (!m) continue;
      const name = m[1];
      if (!name) continue;
      // Skip exported types: consumers may live elsewhere.
      if (text.match(/^\s*export\s+/)) continue;
      const refCount = countLocal(ctx.newContent, name, ln) +
        otherFilesUse(ctx, name);
      if (refCount > 0) continue;
      // Determine the full extent of the declaration so apply-safe removes
      // the whole interface/type block, not just the opener.
      let endLine = ln;
      const isInterface = /^\s*(?:export\s+)?interface\b/.test(text);
      if (isInterface) {
        // Walk to the matching closing `}`.
        const idx = ln - 1;
        const endIdx = findBraceEnd(lines, idx);
        endLine = endIdx + 1;
      } else {
        // type alias: continues until line ending without `,` / `|` / `&` continuation.
        let i = ln - 1;
        while (i < lines.length - 1 && !/[;}]\s*$/.test(lines[i] ?? "")) i++;
        endLine = i + 1;
      }
      findings.push(
        makeFinding("AR007", ctx, {
          line: ln,
          endLine,
          message: `Type \`${name}\` is declared but never used.`,
          confidence: "high",
          suggestion: { kind: "remove-lines", startLine: ln, endLine },
        })
      );
    }
    return findings;
  },
};

function countLocal(content: string, name: string, ignoreLine: number): number {
  const lines = content.split("\n");
  const re = new RegExp(`\\b${escape(name)}\\b`, "g");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 === ignoreLine) continue;
    const matches = (lines[i] ?? "").match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function otherFilesUse(ctx: any, name: string): number {
  let n = 0;
  const re = new RegExp(`\\b${escape(name)}\\b`);
  for (const f of ctx.diff.files) {
    if (f.path === ctx.filePath) continue;
    if (f.newContent && re.test(f.newContent)) n++;
  }
  return n;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
