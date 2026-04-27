# agent-review JSON output schema

`agent-review --json` emits a stable JSON document. Versioning is in the `schema` field; we will bump the major version on any breaking change.

## Top-level shape

```json
{
  "schema": "agent-review/v1",
  "generatedAt": "2026-04-26T17:00:00.000Z",
  "summary": {
    "total": 6,
    "bySeverity": { "info": 0, "low": 3, "medium": 2, "high": 1, "critical": 0 },
    "byCategory": { "dead-code": 3, "drive-by": 2, "safety": 1 },
    "byDetector": { "AR001": 1, "AR002": 2, "AR012": 1, "AR017": 1, "AR009": 1 },
    "highestSeverity": "high"
  },
  "findings": [ /* ... */ ]
}
```

## Finding object

```ts
{
  detectorId: string;        // "AR001" through "AR035"
  category: string;          // "dead-code" | "drive-by" | "hallucination" | ...
  title: string;             // human-readable detector title
  file: string;              // path relative to repo root
  line: number;              // 1-indexed line in the new content
  endLine: number;           // 1-indexed inclusive end line
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;           // one-line description
  excerpt?: string;          // ~3 lines of context around the finding
  confidence: "low" | "medium" | "high";
  rationale?: string;        // present for LLM-driven findings
  suggestion?: {
    kind: "remove-lines" | "replace-range" | "add-import" | "text-only";
    startLine?: number;      // for remove-lines / replace-range
    endLine?: number;        // for remove-lines / replace-range
    replacement?: string;    // for replace-range
    importStatement?: string;// for add-import
    text?: string;           // for text-only
  };
}
```

## Stability guarantees

- The `schema` value indicates the major version. We will not break consumers of `agent-review/v1` without bumping.
- Detector IDs are forever. Numbers do not move.
- The `category` enum may grow. Consumers should treat unknown categories as "other".
- New top-level fields may be added without bumping the schema major version.
- Fields documented above will not be removed without a major bump.

## Exit codes

```
0   no findings, or findings below the configured `--fail-on` threshold
2   findings at or above the `--fail-on` threshold
1   internal error (parse failure, missing git repo, etc.)
```
