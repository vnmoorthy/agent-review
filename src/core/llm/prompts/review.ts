// The orchestrator prompt that runs all 10 LLM checks against a single file
// in one call. Returns a JSON array of findings.

export const SYSTEM_PROMPT = `You are an extremely careful code reviewer specialised in reviewing code that AI coding agents (Claude Code, Codex, Cursor, etc.) just wrote or modified.

Your job is to spot a specific class of agent-introduced failures that human reviewers often miss. You must be conservative: only report a finding when there is concrete evidence in the diff, not on style or taste.

You return ONLY a JSON object matching the schema you are given. No prose. No explanation outside the JSON.`;

export interface ReviewInput {
  filePath: string;
  diffSnippet: string;
  newContent: string;
  oldContent?: string;
}

export function buildReviewPrompt(input: ReviewInput): string {
  const oldBlock = input.oldContent
    ? `\n--- old (truncated to first 4kB) ---\n${truncate(input.oldContent, 4096)}\n`
    : "";
  return `Review the following diff for the categories listed below. Return ONLY a JSON object that matches this schema:

{
  "findings": [
    {
      "detectorId": "AR026" | "AR027" | "AR028" | "AR029" | "AR030" | "AR031" | "AR032" | "AR033" | "AR034" | "AR035",
      "line": <integer 1-indexed line in the new content>,
      "endLine": <integer 1-indexed line in the new content>,
      "severity": "info" | "low" | "medium" | "high" | "critical",
      "confidence": "low" | "medium" | "high",
      "message": "<one sentence describing the issue>",
      "rationale": "<one or two sentences explaining the evidence; no apologies, no hedging>"
    }
  ]
}

Categories:
- AR026 subtle-logic-error: off-by-one, inverted condition, wrong operand order, swapped operator. Only report when the function name or docstring or surrounding test reveals the intent.
- AR027 spec-drift-from-docstring: implementation doesn't match the function name or docstring/comment contract.
- AR028 unrequested-feature: the diff adds behavior beyond the apparent task scope (e.g., a fix-bug PR that adds a metrics middleware).
- AR029 missing-edge-case: changed function visibly omits an obvious edge case (empty input, null/undefined, boundary value, division by zero, integer overflow).
- AR030 unhandled-error-path: a fallible operation (network, fs, parse, JSON, regex) called without handling failure.
- AR031 redundant-abstraction: new helper or wrapper that doesn't simplify anything material.
- AR032 changed-public-contract: signature, exported type, or public API changed in a way the user likely didn't request. Only report on EXPORTED/PUBLIC items.
- AR033 silently-changed-behavior: looks like a refactor but changes observable behavior (default value, error message, status code, log level).
- AR034 fabricated-citation: comment or string referencing a spec/RFC/ticket/URL that looks fake or contradicts the linked claim.
- AR035 incomplete-implementation: function body contains a placeholder (\`pass\`, \`return null\`, \`// implementation pending\`, \`throw new Error('not implemented')\`) where the diff implies the function should be complete.

Rules:
- Be CONSERVATIVE. Only report when evidence is concrete. Empty findings array is the right answer if nothing fires.
- Set "confidence" to "low" when you're unsure, "high" only when you can point to a specific line.
- One finding per issue. No duplicates.
- "line" and "endLine" must be valid line numbers in the NEW content.
- DO NOT include findings that don't match the listed AR0xx ids.
- Output JSON only.

File: ${input.filePath}
${oldBlock}
--- new (truncated to first 12kB) ---
${truncate(input.newContent, 12 * 1024)}

--- diff snippet ---
${truncate(input.diffSnippet, 6 * 1024)}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n[truncated]";
}
