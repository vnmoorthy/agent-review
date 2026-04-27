// AR003 — large blocks of comments that look like commented-out code, added
// in this diff. We require at least two consecutive code-ish comment lines
// to fire (a single TODO is handled by AR013).

import type { Detector, Finding } from "../types.js";
import { isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, looksLikeCommentedOutCode, makeFinding } from "../helpers.js";

export const detector: Detector = {
  id: "AR003",
  category: "dead-code",
  title: "Commented-out code left behind",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    const newLines = (ctx.newContent ?? "").split("\n");
    const added = new Set(addedLineNumbers(ctx));
    const findings: Finding[] = [];

    let runStart = -1;
    let runLength = 0;
    const flush = (endLine: number) => {
      if (runStart > 0 && runLength >= 2) {
        findings.push(
          makeFinding("AR003", ctx, {
            line: runStart,
            endLine,
            message: `Commented-out code (${runLength} consecutive lines). Remove or restore.`,
            confidence: "medium",
            suggestion: {
              kind: "remove-lines",
              startLine: runStart,
              endLine,
            },
          })
        );
      }
      runStart = -1;
      runLength = 0;
    };

    for (let i = 1; i <= newLines.length; i++) {
      const line = newLines[i - 1] ?? "";
      const isAdded = added.has(i);
      const isCodey = looksLikeCommentedOutCode(line);
      if (isAdded && isCodey) {
        if (runStart === -1) runStart = i;
        runLength++;
      } else {
        flush(i - 1);
      }
    }
    flush(newLines.length);
    return findings;
  },
};
