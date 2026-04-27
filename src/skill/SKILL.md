---
name: agent-review
description: Run after finishing any coding task to catch the 35 specific failure modes AI agents commit (dead code, hallucinated APIs, drive-by refactors, silent catches, spec drift). Use this skill when the user is wrapping up a code change, just before declaring "done", or whenever they want a review of the latest diff. Triggers on phrases like "review my changes", "before I commit", "check what I just did", "lint my diff", "is this clean", or any moment you've just made code edits across files.
---

# agent-review skill

This skill turns Claude Code into a self-reviewing agent: before you declare a task complete, you run `agent-review` against the diff you just produced and surface any issues to the user.

## When to invoke this skill

Invoke after you finish a unit of coding work, especially:

- You've edited 2+ files in this session.
- The user said "are we done?", "let's commit", "ready to push", or anything similar.
- You're about to summarize the work in a final response.
- The user asked specifically for a review of changes.

## How to invoke

Run `agent-review --json` against the appropriate diff scope.

```
# Default: review staged changes
npx agent-review --json

# Review last commit (e.g., after you committed at the user's request)
npx agent-review --last-commit --json

# Review the working tree (uncommitted edits)
npx agent-review --working-tree --json

# Restrict to files you touched
npx agent-review --working-tree --files src/foo.ts src/bar.ts --json
```

If the user has `ANTHROPIC_API_KEY` set and is OK with sending code to a model, add `--llm` to enable the 10 LLM-augmented detectors (subtle logic, spec drift, missing edge case, etc.):

```
npx agent-review --working-tree --llm --json
```

## How to act on the output

The JSON structure is:

```
{
  "schema": "agent-review/v1",
  "summary": { "total": N, "bySeverity": {...}, "byCategory": {...} },
  "findings": [
    {
      "detectorId": "AR001",
      "category": "dead-code",
      "title": "Dead code introduced",
      "file": "src/foo.ts",
      "line": 42,
      "endLine": 42,
      "severity": "medium",
      "confidence": "high",
      "message": "...",
      "suggestion": { "kind": "remove-lines", "startLine": 42, "endLine": 42 }
    }
  ]
}
```

Group findings by severity in your reply:

1. **Critical / High:** call these out clearly. Don't bury them.
2. **Medium:** mention them.
3. **Low / Info:** summarize the count, don't list every one.

For each high-confidence `auto-safe` finding (look up in `agent-review list` if unsure — auto-safe currently includes `AR001`, `AR002`, `AR003`, `AR007`, `AR012`), ask the user if they want to apply the fix automatically, then run:

```
npx agent-review --working-tree --apply-safe
```

For `suggestion-only` findings, present the suggestion and let the user decide.

## What NOT to do

- Do **not** silently re-edit the user's code based on findings. Surface them first.
- Do **not** skip findings just to "look done" — the point of this skill is to be honest about what's still off.
- Do **not** call this skill on diffs that contain only test fixtures or generated files.

## Example flow

User: "Fix the bug where signups don't email confirmation."

You: [edits 3 files, runs tests, things pass]

You: [invoke agent-review on working tree]

You: "Done. Tests pass. agent-review surfaced 2 issues:
- 1× **High** AR017 silent-catch on `src/email/send.ts:61` — the SMTP error is swallowed.
- 1× **Low** AR002 unused-import on `src/email/send.ts:3` — unused `format` from `date-fns`.

Want me to drop the unused import and surface the SMTP error to the caller?"
