# Changelog

All notable changes to agent-review are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — initial release

### Added

- 25 static detectors (AR001–AR025) covering dead code, hallucinated APIs, drive-by refactors, debug prints, silent catches, hardcoded credentials, and more.
- 10 LLM-augmented detectors (AR026–AR035) for subtle logic errors, spec drift, missing edge cases, and other patterns that need a model to spot.
- Three output formats: terminal (with color), markdown (PR-comment ready), and JSON (stable schema, documented in `docs/json-schema.md`).
- `--apply-safe` for high-confidence auto-fixes.
- Claude Code skill version installable via `npx agent-review skill install`.
- Anthropic and Ollama LLM providers; offline-first with no LLM by default.
- Support for TypeScript, JavaScript, JSX, TSX, Python, Go, and Rust.
- GitHub Action template for PR review comments.
- Issue templates for new-detector proposals and bug reports.

### Notes

- Tree-sitter is an optional peer dependency. agent-review falls back to a regex-based parser when it isn't installed; detectors degrade gracefully.
- Findings are emitted in deterministic order (file, line, detector ID) so output diffs are reviewable.
