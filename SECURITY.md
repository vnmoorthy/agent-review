# Security policy

## Reporting a vulnerability

Please email **vnarasingamoorthy@gmail.com** with a description and reproduction steps. Do not open a public issue for unreported vulnerabilities.

## Trust boundaries

agent-review reads code from a git diff and runs detectors against it. The runtime trust model has three trust zones:

| Zone | Source | Trust | Notes |
|---|---|---|---|
| Built-in detectors | shipped with the npm package | trusted | versioned, signed by npm publish, deterministic |
| LLM-augmented detectors | shipped with the npm package | trusted (code) / untrusted (responses) | the LLM **response** is parsed via a zod schema before use; nothing is `eval`'d |
| Custom detectors | `.agent-review.json` `customDetectors` | **UNTRUSTED** | files are loaded via `require()`, run at full Node privilege |

### `customDetectors` is an opt-in trust boundary

Custom detector files are JavaScript modules loaded via Node's `require()`. Top-level code in those files runs with the full privileges of the user running `agent-review` (read filesystem, env vars, network, spawn processes). This is the same trust model as ESLint plugins, Webpack plugins, and Prettier plugins.

**Threat:** A malicious `.agent-review.json` checked into a repo (via PR, fork, or compromised dependency) can run arbitrary code on a developer's machine the next time they run `agent-review`. The Claude Code skill auto-runs agent-review at task wrap-up, so the trigger is automatic for skill users.

**Mitigations shipped:**

- `--no-plugins` CLI flag and `AGENT_REVIEW_NO_PLUGINS=1` environment variable disable plugin loading entirely.
- The Claude Code skill (`src/skill/SKILL.md`) sets `AGENT_REVIEW_NO_PLUGINS=1` on every example command — auto-runs are safe by default.
- agent-review prints a warning to stderr whenever it loads custom detectors, naming the count and pointing at the disable mechanisms.

**If you use `customDetectors` in a project:**

- Treat the detector files as trusted code. Only enable them in repos you control.
- Pin or vendor them rather than referencing remote paths.
- Review changes to detector files in PRs the same way you'd review CI changes.

### LLM data exfiltration

When invoked with `--llm`, agent-review sends the diff content to the LLM provider you configure (Anthropic, OpenAI, or a local Ollama). Code that you don't want to leave your machine should not be reviewed with `--llm` enabled.

### Pre-commit hook

`agent-review hook install` and `agent-review init` write a `.git/hooks/pre-commit` script. Existing hooks are overwritten without backup. Inspect the directory before running these commands if you have an existing hook.

## Reporting scope

In scope:
- Bugs that allow code execution on a developer machine outside the documented `customDetectors` trust boundary.
- Bugs that cause agent-review to mis-report or hide findings (false negatives that would let a real bug ship).
- Supply chain weaknesses in the published npm tarball or composite GitHub Action.

Out of scope:
- The documented `customDetectors` trust boundary. The mitigations above are the answer.
- Bugs in dependencies (chalk, commander, zod) — report those upstream.
- Theoretical issues without a concrete exploit path.
