// AR015 — same try/catch wrapping pattern repeated multiple times where one
// would suffice.

import type { Detector, Finding } from "../types.js";
import { isLanguageFile, detectLang } from "../../git/files.js";
import { makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR015",
  category: "drive-by",
  title: "Duplicate error handling",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const lang = detectLang(ctx.filePath);
    const lines = ctx.newContent.split("\n");

    // Collect catch lines (and their hashes) inside the diff range.
    interface Block {
      catchLine: number;
      tryLine: number;
      bodyHash: string;
    }
    const blocks: Block[] = [];

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      let catchMatch: RegExpMatchArray | null = null;
      if (lang === "py") catchMatch = text.match(/^\s*except\b[^:]*:/);
      else catchMatch = text.match(/^\s*}\s*catch\s*\(?[\w$:\s]*\)?\s*\{?/);
      if (!catchMatch) continue;
      // Read the actual catch body, stopping at the closing `}`.
      const bodyArr: string[] = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const t = (lines[j] ?? "").trim();
        if (t === "}" || /^}\s*(?:catch|finally)/.test(t)) break;
        if (t === "") continue;
        bodyArr.push(t);
      }
      // Skip catches the author has explicitly annotated as intentional.
      if (bodyArr.some((l) => /(?:\/\/|#).*(?:intentional|expected|ok\b|fine|ignored?\s+by|safe)/i.test(l))) continue;
      // Skip catches that are just a single control-flow keyword — those are AR017's domain.
      if (
        bodyArr.length <= 1 &&
        /^(return|pass|continue|break|throw)\b/.test(bodyArr[0] ?? "")
      )
        continue;
      // Need at least 2 substantive lines for "duplicate" to be meaningful.
      if (bodyArr.length < 2) continue;
      const bodyHash = simpleHash(bodyArr.join("|"));
      blocks.push({ catchLine: i + 1, tryLine: i + 1, bodyHash });
    }

    const groups = new Map<string, number[]>();
    for (const b of blocks) {
      // Skip trivial / empty / single-line catch bodies — those are AR017's domain.
      if (b.bodyHash === "0" || b.bodyHash === "") continue;
      if (!groups.has(b.bodyHash)) groups.set(b.bodyHash, []);
      groups.get(b.bodyHash)!.push(b.catchLine);
    }

    const findings: Finding[] = [];
    for (const [, group] of groups) {
      if (group.length < 2) continue;
      // At least one of these catches must be in the diff.
      if (!group.some((ln) => ctx.changedLines.has(ln))) continue;
      const first = group[0];
      if (typeof first !== "number") continue;
      findings.push(
        makeFinding("AR015", ctx, {
          line: first,
          endLine: first,
          message: `Duplicate catch body repeated ${group.length} times. Consider hoisting one wrapping handler.`,
          confidence: "low",
          suggestion: {
            kind: "text-only",
            text: "Move shared error handling to a single try around the calls, or extract a helper.",
          },
        })
      );
    }
    return findings;
  },
};

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
