# Configuration

agent-review reads its configuration from one of these files at the repo root, in priority order:

1. `.agent-review.json`
2. `agent-review.config.json`
3. `.agent-review.config.json`

A starter config is checked in as [`agent-review.config.example.json`](../agent-review.config.example.json).

## Options

```jsonc
{
  // Glob-style patterns. Matches use simple ** / * / ? semantics.
  "exclude": ["dist/**", "vendor/**"],

  // If set and non-empty, only matching paths are reviewed.
  "include": [],

  // Default minimum severity (info | low | medium | high | critical).
  "severity": "info",

  // Exit-code policy: never | any | high | critical.
  "failOn": "high",

  // Per-detector overrides. Three forms supported:
  "rules": {
    "AR014": "off",                          // disable entirely
    "AR020": { "severity": "low" },          // override severity
    "AR018": { "severity": "critical" }
  },

  // LLM provider settings.
  "llm": {
    "enabled": false,
    "provider": "anthropic",                  // "anthropic" | "openai" | "ollama" | "none"
    "model": "claude-haiku-4-5-20251001",
    "timeoutMs": 60000
  },

  // Paths to custom detectors. Each module must export `detector` or `detectors`.
  "customDetectors": ["./detectors/no-cron.js"],

  // Where to keep the baseline file (defaults to .agent-review-baseline.json).
  "baselineFile": ".agent-review-baseline.json"
}
```

## Custom detectors

A custom detector is a small JavaScript module that follows the same shape as the built-in detectors. IDs MUST start with `CUSTOM` so they don't collide with the built-in `AR0XX` taxonomy.

> **Trust note:** custom detector files are loaded via `require()` and run with full Node privileges. Only enable them in repos you control. Pass `--no-plugins` (or set `AGENT_REVIEW_NO_PLUGINS=1`) to skip plugin loading entirely. The Claude Code skill ships with this set by default. See [SECURITY.md](../SECURITY.md).

```js
// detectors/no-set-timeout.js
exports.detector = {
  id: "CUSTOM_NO_SETTIMEOUT",
  category: "drive-by",
  title: "setTimeout outside tests",
  applies: (ctx) =>
    ctx.filePath.endsWith(".ts") && !ctx.filePath.includes("/test/"),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    return ctx.newContent.split("\n").reduce((acc, line, i) => {
      if (/\bsetTimeout\s*\(/.test(line)) {
        acc.push({
          detectorId: "CUSTOM_NO_SETTIMEOUT",
          category: "drive-by",
          title: "setTimeout outside tests",
          file: ctx.filePath,
          line: i + 1,
          endLine: i + 1,
          severity: "medium",
          confidence: "high",
          message: "Use the platform scheduler, not setTimeout, in production code.",
        });
      }
      return acc;
    }, []);
  },
};
```

Reference it in your config:

```json
{ "customDetectors": ["./detectors/no-set-timeout.js"] }
```

## Inline ignore directives

Suppress findings inline using ESLint-style comments:

```ts
// agent-review-ignore-next-line AR012
console.log("only here for one-off debugging");

// agent-review-ignore-line AR017
try { x() } catch (e) { /* swallow on purpose */ }

// agent-review-ignore-file AR018, AR011

// agent-review-disable AR012
console.log("a")
console.log("b")
// agent-review-enable
```

When the directive omits IDs (`// agent-review-ignore-next-line`), it suppresses all detectors on the target line.

## Severity levels

| Level    | Meaning                                                  |
|----------|----------------------------------------------------------|
| info     | Stylistic / informational. Often suppressed by default.  |
| low      | Minor cleanup; safe to ship if you must.                 |
| medium   | Worth fixing before merging.                             |
| high     | Blocks merge by default (see `failOn`).                  |
| critical | Hardcoded credentials and similar. Always block.         |
