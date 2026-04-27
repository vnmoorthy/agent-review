# Launch playbook

Don't ship this without reading. The taxonomy is the marketing artifact. The tool is the delivery vehicle.

## T-1 day

- Run `npx agent-review` against 5 well-known repos. Confirm zero crashes, low false-positive rate.
- Cut a 30-second cast.gif: `npx agent-review` on a deliberately bad diff, then `npx agent-review --apply-safe`. Embed in README.
- Verify `npx agent-review` works on a clean machine (no global install).
- Tag v0.1.0 on GitHub and push to npm.

## Show HN (Tuesday 9am ET)

**Title:** Show HN: I cataloged 35 bugs AI coding agents commit and built a tool to catch them

**Body:**

> AI coding agents have a different bug profile than humans. Generic linters miss most of it. I spent three weeks cataloging the patterns I kept seeing in real Claude Code, Codex, and Cursor sessions. The result is 35 specific failure modes (TAXONOMY.md) and a tool that detects them.
>
> Static detectors catch 25 of the 35 with no API key, no network, no LLM call. The remaining 10 fuzzier patterns (subtle logic errors, spec drift, missing edge cases, fabricated citations) need a model — pass `--llm` and your `ANTHROPIC_API_KEY` and they run in a single batched call per file.
>
> The interesting part is the taxonomy itself. Three structural differences drive the failure profile: agents over-build, agents pattern-match across languages, agents focus on the happy path. Each entry in the taxonomy explains the failure mode, why agents commit it, and how the detector works.
>
> The skill version (`npx agent-review skill install`) drops into `~/.claude/skills/` and turns Claude Code into a self-reviewing agent: before it declares a task done, it runs the review and surfaces findings.
>
> MIT, runs offline by default, contributions to the taxonomy welcome.
>
> Repo: https://github.com/vnmoorthy/agent-review
> Taxonomy: https://github.com/vnmoorthy/agent-review/blob/main/TAXONOMY.md

## r/ClaudeAI

**Title:** I cataloged 35 bugs Claude Code commits and built a skill that catches them

**Body:**

> [Link to TAXONOMY.md]
>
> Spent three weeks watching Claude Code (and Codex, Cursor, etc.) introduce the same kinds of bugs over and over. Patterns I kept seeing:
>
> - Adding helper functions that nothing calls (dead code).
> - Inventing methods like `array.contains()` and `Object.has()` that don't exist.
> - Drive-by refactors that balloon the diff.
> - Empty catch blocks that swallow errors.
> - "Spec drift" — implementation no longer matches the function name or docstring.
> - Stubbed `pass` / `return null` in a function the agent claims is done.
>
> Wrote them up as a taxonomy of 35 patterns and built a tool: `npx agent-review` against your staged diff. Drop-in skill at `npx agent-review skill install` makes Claude self-review before declaring done.
>
> MIT, offline by default. Curious what failure modes I'm missing — please submit issues.

## r/cursor / r/ChatGPTCoding

Same body, swap "Claude Code" for the tool name. Lead with the taxonomy.

## Twitter thread (8 tweets)

1. AI coding agents have a different bug profile than humans. After watching Claude Code, Codex, and Cursor for three weeks, I cataloged 35 patterns. Generic linters miss most of them. 🧵
2. **#1: Agents over-build.** They add helpers nothing calls. Phantom types. Orphaned files. The hallucination isn't an API call — it's the assumption the new helper is needed.
3. **#2: Agents pattern-match across languages.** They confidently invoke `array.contains()` in JS, `len.x()` in Python, `unwrap_or_panic()` in Rust. Plausible because *some* language has it. None of these.
4. **#3: Agents focus on the happy path.** They implement what passes the example, then stop. Edge cases, error paths, and contract drift escape the loop. The most embarrassing one: a confident "done" with a stubbed `pass`.
5. **The 35 patterns** range from cheap-to-detect (unused imports, debug prints) to subtle (silently changed behavior, fabricated RFC citations). 25 are caught by static analysis; 10 need an LLM.
6. **Spec drift** is the one that scares me most. A clean diff, passing tests, broken production. The function name and docstring still claim X; the body now does Y. Easiest way to ship a regression nobody catches.
7. I built a tool: `npx agent-review` against your staged diff. Drop-in skill at `npx agent-review skill install` makes Claude self-review before declaring done. Offline by default. MIT. [link]
8. Full taxonomy with examples for every entry: [TAXONOMY.md link]. If you've spotted a pattern that isn't here, please open an issue — every contribution makes the taxonomy stronger.

## Awesome-list PRs

- awesome-claude-code: add to "Skills" section
- awesome-ai-code-review: add to root
- awesome-static-analysis: add under "JavaScript / TypeScript"

## Discord / Slack

- Anthropic Discord #builders: link to repo + taxonomy
- LangChain Discord #agents: link
- Cursor community: link

## Day-1 metrics to watch

- GitHub stars (target: 200 day 1, 1k week 1)
- npm downloads (target: 500 day 1)
- TAXONOMY.md GitHub views (it'll outpace stars; that's fine)
- New-detector issues opened (target: 5 in week 1)

## Talking points if a thread takes off

- "Why not run an LLM as a code reviewer?" — Static detectors are free, deterministic, and catch 70% of the surface. The LLM tier is opt-in for the rest. This is the right cost/quality split.
- "Won't agents get better and obsolete this?" — The patterns are structural. They'll get rarer per-line, but won't go to zero. And the taxonomy is the artifact that lasts.
- "What about other languages?" — Roadmap. Java/Kotlin/Swift/Ruby/C# next. Want a language? Open an issue.
