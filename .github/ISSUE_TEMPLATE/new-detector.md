---
name: New detector proposal
about: Propose a new failure-mode detector for the taxonomy
title: "[Detector] <short title>"
labels: detector-proposal
---

## Title

A short, specific title for this failure mode (e.g. "Hallucinated database column name").

## Example

Paste an actual agent-generated diff (or close enough) that exhibits the pattern. Anonymize as needed.

```
// before

// after
```

## Why is this distinctly an agent failure mode?

What makes this pattern specific to AI-authored code rather than generic bad code? (Possible answers: cross-language pattern matching, over-building, spec drift, hallucination of API/data shape, etc.)

## Proposed detection approach

Pick one:

- [ ] **Static (deterministic):** describe the regex / AST shape we'd match.
- [ ] **LLM-augmented:** describe the prompt fragment and the structured output it should return.
- [ ] **Hybrid:** static signal plus LLM verification.

## Severity

How bad is this failure mode in practice?

- [ ] info
- [ ] low
- [ ] medium
- [ ] high
- [ ] critical

## Auto-fixability

- [ ] auto-safe (deterministic, won't change behavior)
- [ ] auto-risky (deterministic but changes behavior)
- [ ] suggestion-only

## Languages affected

Which languages does this apply to? (TS/JS, Python, Go, Rust, multi-lang, all.)

## Related entries

Are there existing entries (AR0XX) that overlap or conflict? If so, why is this distinct?
