// AR004 — file changed where the changes look refactor-only (rename,
// reformat, extracted helper) and orthogonal to the rest of the diff.
//
// Heuristic: the file contains hunks but every hunk is one of:
//   - whitespace-only changes
//   - rename of an identifier
//   - reformatting (added/removed blank lines, semicolons)
// AND: no functional tokens (return, throw, new, await, =, !==, etc.) added.

import type { Detector, Finding } from "../types.js";
import { isLanguageFile } from "../../git/files.js";
import { makeFinding } from "../helpers.js";

const FUNCTIONAL_TOKENS = [
  /\breturn\b/,
  /\bthrow\b/,
  /\bnew\s+[A-Z]/,
  /\bawait\b/,
  /===|!==|==|!=|>=|<=/,
  /[+\-*/%]=/,
  /\bif\b\s*\(/,
  /\belse\b/,
  /\bfor\b\s*\(/,
  /\bwhile\b\s*\(/,
  /\btry\b/,
  /\bcatch\b/,
];

export const detector: Detector = {
  id: "AR004",
  category: "drive-by",
  title: "Drive-by refactor",
  applies: (ctx) => isLanguageFile(ctx.filePath) && ctx.fileDiff.status === "modified",
  run: (ctx) => {
    const fd = ctx.fileDiff;
    if (!fd.hunks.length) return [];

    let added = 0;
    let removed = 0;
    let functionalAdded = 0;

    for (const hunk of fd.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          added++;
          const body = line.slice(1).trim();
          if (body && FUNCTIONAL_TOKENS.some((re) => re.test(body))) functionalAdded++;
        } else if (line.startsWith("-")) {
          removed++;
        }
      }
    }

    if (added < 4) return [];
    // If functional changes exceed 25% of additions, it's not drive-by.
    if (functionalAdded > Math.max(2, added * 0.25)) return [];
    // If the diff has only one file, this is the user's whole change; don't
    // call it drive-by.
    if (ctx.diff.files.length < 2) return [];

    const firstHunk = fd.hunks[0];
    if (!firstHunk) return [];
    return [
      makeFinding("AR004", ctx, {
        line: firstHunk.newStart,
        endLine: firstHunk.newStart,
        message: `${added} lines changed in ${ctx.filePath} look refactor-only and unrelated to the diff's main intent.`,
        confidence: "low",
        suggestion: {
          kind: "text-only",
          text: "Move drive-by refactors to a separate commit so the main change is reviewable in isolation.",
        },
      }),
    ];
  },
};
