// AR018 — hardcoded credentials. Only fires on string literals that look
// like secrets and are added in the diff.

import type { Detector, Finding } from "../types.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";

const SECRET_PATTERNS: Array<{ re: RegExp; what: string }> = [
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, what: "OpenAI / Anthropic-style API key" },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, what: "Anthropic API key" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, what: "Slack token" },
  { re: /\bAKIA[0-9A-Z]{16}/, what: "AWS access key" },
  { re: /\bASIA[0-9A-Z]{16}/, what: "AWS temporary access key" },
  { re: /\bghp_[A-Za-z0-9]{36}/, what: "GitHub personal access token" },
  { re: /\bgho_[A-Za-z0-9]{36}/, what: "GitHub OAuth token" },
  { re: /\bglpat-[A-Za-z0-9_-]{20}/, what: "GitLab token" },
  { re: /\b(?:Bearer|bearer)\s+[A-Za-z0-9._-]{30,}/, what: "Bearer token" },
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, what: "Private key" },
  {
    re: /(?:password|passwd|secret|api_?key|apiKey|token|access_?token)\s*[:=]\s*["'][^"']{8,}["']/i,
    what: "Inline credential literal",
  },
];

export const detector: Detector = {
  id: "AR018",
  category: "secrets",
  title: "Hardcoded credential",
  applies: (ctx) => !!ctx.newContent,
  run: (ctx) => {
    const lines = (ctx.newContent ?? "").split("\n");
    const findings: Finding[] = [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = lines[ln - 1] ?? "";
      // Don't flag examples in test, fixture, or detector-source files.
      const lowered = ctx.filePath.toLowerCase();
      if (
        lowered.includes("fixture") ||
        lowered.includes("example") ||
        /(^|\/)(test|tests)\//.test(lowered) ||
        /\.test\.(ts|tsx|js|jsx|py)$/.test(lowered) ||
        /\.spec\.(ts|tsx|js|jsx|py)$/.test(lowered) ||
        ctx.filePath.includes("/core/detectors/") ||
        ctx.filePath.endsWith("TAXONOMY.md") ||
        ctx.filePath.endsWith("README.md")
      ) {
        continue;
      }
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(text)) {
          findings.push(
            makeFinding("AR018", ctx, {
              line: ln,
              endLine: ln,
              severity: "critical",
              message: `Possible ${p.what} hardcoded in source.`,
              confidence: "high",
              suggestion: {
                kind: "text-only",
                text: "Move to an environment variable or secret manager. Rotate the value if it ever shipped.",
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
