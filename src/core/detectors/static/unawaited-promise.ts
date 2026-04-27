// AR022 — async function whose return value is discarded.
//
// Heuristic detection: in an async function, a statement that calls a
// known-async-returning name (one that elsewhere appears with `await`) but
// is invoked here as a bare expression statement.

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";
import { findBraceEnd } from "../brace-walker.js";

export const detector: Detector = {
  id: "AR022",
  category: "concurrency",
  title: "Unawaited promise",
  applies: (ctx) => ["ts", "tsx", "js", "jsx"].includes(detectLang(ctx.filePath)),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const lines = ctx.newContent.split("\n");
    const content = ctx.newContent;

    // Build a set of identifiers that appear preceded by `await` somewhere.
    const awaitedSet = new Set<string>();
    for (const m of content.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (m[1]) awaitedSet.add(m[1]);
    }
    for (const m of content.matchAll(/\bawait\s+([A-Za-z_$][\w$.]*)\s*\(/g)) {
      const root = (m[1] ?? "").split(".")[0];
      if (root) awaitedSet.add(root);
    }
    if (awaitedSet.size === 0) return [];

    // Find async-function regions.
    const asyncRegions: Array<[number, number]> = [];
    const reAsync =
      /^\s*(?:export\s+)?(?:async\s+function\b|const\s+\w+\s*=\s*async\b|\w+\s*:\s*async\s*\()/;
    for (let i = 0; i < lines.length; i++) {
      if (reAsync.test(lines[i] ?? "")) {
        const end = findBraceEnd(lines, i);
        asyncRegions.push([i + 1, end + 1]);
      }
    }
    if (asyncRegions.length === 0) return [];

    for (const ln of addedLineNumbers(ctx)) {
      if (!asyncRegions.some(([s, e]) => s <= ln && ln <= e)) continue;
      const text = lines[ln - 1] ?? "";
      // Skip lines that are clearly assignments or returns.
      if (/^\s*(return|await|const|let|var)\b/.test(text)) continue;
      if (/=\s*[A-Za-z_$]/.test(text)) continue;
      // Looking for `name(...);`
      const m = text.match(/^\s*([A-Za-z_$][\w$.]*)\s*\(/);
      if (!m) continue;
      const root = (m[1] ?? "").split(".")[0] ?? "";
      if (!awaitedSet.has(root)) continue;
      findings.push(
        makeFinding("AR022", ctx, {
          line: ln,
          endLine: ln,
          message: `\`${m[1]}\` returns a Promise but the call is not awaited.`,
          confidence: "low",
          suggestion: {
            kind: "text-only",
            text: `Add \`await\` (or \`void\` to deliberately discard) and ensure errors are handled.`,
          },
        })
      );
    }
    return findings;
  },
};

