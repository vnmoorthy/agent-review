# Changelog

All notable changes to agent-review are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Reject unknown subcommands. Previously, `agent-review bogus-command` silently fell through to the default `review` and exited 0; it now exits 1 with a clear error.
- Validate `--severity`, `--fail-on`, and `--provider` against their documented choices. Bad values previously slipped through into the run with unpredictable behavior; they now exit 1 with the allowed list.
- Warn loudly to stderr when `--llm` is requested but no provider is configured. Previously the run silently fell back to static-only.
- Complete the `@vnmoorthy/agent-review` migration in the spots that 0.1.4 missed: `action.yml` (4 invocations), the bundled hook scripts emitted by `agent-review init` and `agent-review hook install`, the Claude Code skill template (`src/skill/SKILL.md`), the bug-report issue template, the README's `npm i -g`/`-D` lines, and the npm/Node version badges. The unscoped `agent-review` name on npm still resolves to a stale 0.1.1 that crashes with `Cannot find module 'tsx/cjs'`.

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
