# Changelog

All notable changes to agent-review are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.6] — 2026-04-27

### Security

- **Tightened the `customDetectors` trust boundary.** `customDetectors` config entries are loaded via `require()` and run with full Node privileges. The Claude Code skill auto-runs agent-review at task wrap-up, which made repo-driven `customDetectors` a one-step RCE vector for malicious repos.
  - New `--no-plugins` CLI flag and `AGENT_REVIEW_NO_PLUGINS=1` environment variable disable plugin loading.
  - The bundled Claude Code skill template (`src/skill/SKILL.md`) now sets `AGENT_REVIEW_NO_PLUGINS=1` on every example command, so auto-runs are safe by default.
  - When custom detectors ARE loaded, agent-review writes a one-line warning to stderr naming the count and pointing at the disable mechanisms.
  - Added [SECURITY.md](./SECURITY.md) documenting the trust model.
- **SHA-pinned `peter-evans/create-or-update-comment`** in `action.yml` (was `@v4`, now pinned to `71345be0…` with `# v4` comment for readability). Added `.github/dependabot.yml` to keep the SHA pin updated automatically.

### Fixed

- `--files <path>` git error is now translated to `agent-review: one or more --files paths could not be found in the diff: <names>` instead of leaking the raw git command line.
- Running outside a git repo gives a one-line `must be run inside a git repository` instead of a raw `git rev-parse… failed` line.
- The static-only banner (`Set ANTHROPIC_API_KEY…`) only prints on terminal output AND when there are findings — clean runs no longer get nagged on every invocation.
- `agent-review explain <id>` relabels its examples from ambiguous `Example (before)` / `Example (after)` to `Clean code:` / `What the agent commits:`. The semantics were always "before/after the agent introduced the bug," but readers expected "before/after the fix."
- `docs/config.md` and the README now reference the same custom-detector example (`no-set-timeout.js`) instead of two different ones.
- Cleared four `@typescript-eslint/no-unused-vars` warnings in `src/core/detectors/static/`.

## [0.1.5] — 2026-04-27

### Fixed

- Reject unknown subcommands. Previously, `agent-review bogus-command` silently fell through to the default `review` and exited 0; it now exits 1 with a clear error.
- Validate `--severity`, `--fail-on`, and `--provider` against their documented choices. Bad values previously slipped through into the run with unpredictable behavior; they now exit 1 with the allowed list.
- Warn loudly to stderr when `--llm` is requested but no provider is configured. Previously the run silently fell back to static-only.
- Complete the `@vnmoorthy/agent-review` migration in the spots that 0.1.4 missed: `action.yml` (4 invocations), the bundled hook scripts emitted by `agent-review init` and `agent-review hook install`, the Claude Code skill template (`src/skill/SKILL.md`), the bug-report issue template, the README's `npm i -g`/`-D` lines, and the npm/Node version badges. The unscoped `agent-review` name on npm still resolves to a stale 0.1.1 that crashes with `Cannot find module 'tsx/cjs'`.
- The `npx --yes --package=@vnmoorthy/agent-review -- agent-review …` form failed on GitHub-hosted Ubuntu runners as well (`sh: 1: agent-review: not found`) — npx's scoped-bin resolution is unreliable on Linux regardless of `--package` syntax, even though the published tarball ships an executable bin. Replaced both with `npm install` into `$RUNNER_TEMP/agent-review` followed by `node "$AR_BIN" …`. No npx, no PATH lookup, no scoped-bin ambiguity. Hook scripts emitted by `agent-review init` and `agent-review hook install` keep using `npx --yes --package=…` since they run on a developer machine that already has the package cached from running `init`.

### CI

- `pnpm lint` runs on every push/PR. Cleared the six pre-existing `no-useless-escape` and `prefer-const` errors that had accumulated in `src/core/project.ts`, `src/core/ast/loaders.ts`, and `src/core/config-file.ts`.

### Docs

- `docs/config.md` provider enum includes `"openai"` (was out of sync with the CLI).

## [0.1.4] — 2026-04-27

### Fixed

- `--version` now resolves correctly under the scoped package name `@vnmoorthy/agent-review` (previously hardcoded to match the unscoped name).

### Docs

- Mermaid diagram in README renders correctly (escaped pipes inside node labels).
- First batch of `npx` install commands in the README updated to `@vnmoorthy/agent-review`.

## [0.1.3] — 2026-04-27

### Changed

- Version string is read from `package.json` at runtime instead of being hardcoded, so forks and scoped republishes always show the right version under `--version`.

## [0.1.2] — 2026-04-27

### Changed

- Republished as `@vnmoorthy/agent-review` (scoped). The unscoped name on npm is no longer the active distribution channel.

## [0.1.1] — 2026-04-27

### Changed

- Repo URLs updated to `vnmoorthy/agent-review`.
- `dist/` is no longer checked into the tree; published tarballs still ship the bundle via the `prepublishOnly` build step.

### Fixed

- pnpm lockfile re-synced after install.

## [0.1.0] — initial release

### Added

- 25 static detectors (AR001–AR025) covering dead code, hallucinated APIs, drive-by refactors, debug prints, silent catches, hardcoded credentials, and more.
- 10 LLM-augmented detectors (AR026–AR035) for subtle logic errors, spec drift, missing edge cases, and other patterns that need a model to spot.
- Three output formats: terminal (with color), markdown (PR-comment ready), and JSON (stable schema, documented in `docs/json-schema.md`).
- `--apply-safe` for high-confidence auto-fixes.
- Claude Code skill version installable via `npx @vnmoorthy/agent-review skill install`.
- Anthropic and Ollama LLM providers; offline-first with no LLM by default.
- Support for TypeScript, JavaScript, JSX, TSX, Python, Go, and Rust.
- GitHub Action template for PR review comments.
- Issue templates for new-detector proposals and bug reports.

### Notes

- Tree-sitter is an optional peer dependency. agent-review falls back to a regex-based parser when it isn't installed; detectors degrade gracefully.
- Findings are emitted in deterministic order (file, line, detector ID) so output diffs are reviewable.
