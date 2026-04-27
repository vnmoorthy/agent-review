# Contributing to agent-review

Thanks for considering a contribution. Two kinds of contributions are most valuable:

1. **New detectors** for failure modes we don't yet catch. Use the [new-detector issue template](./.github/ISSUE_TEMPLATE/new-detector.md).
2. **False-positive reductions** for existing detectors. If `agent-review` flags something that's correct, please open an issue with the diff and the finding.

## Local development

```bash
git clone https://github.com/vnmoorthy/agent-review
cd agent-review
pnpm install   # or npm install
pnpm build
pnpm test
pnpm self      # run agent-review against this repo's staged changes
```

## Adding a detector

1. Pick the next free `AR0XX` ID from `src/core/taxonomy/registry.ts`.
2. Add the entry to `TAXONOMY` in that file.
3. Create the detector at `src/core/detectors/static/<name>.ts` (or `llm/<name>.ts`).
4. Register it in `src/core/detectors/index.ts`.
5. Add a positive fixture under `test/fixtures/bad/AR0XX/` and (optionally) a negative under `test/fixtures/good/AR0XX/`.
6. Add a test in `test/detectors.test.ts`.
7. Add a section in `TAXONOMY.md`.

## Style

- Each detector file <150 lines.
- No `console.log` outside the CLI; use `logger()`.
- Detectors must never throw; on internal error, return `[]`.
- TypeScript strict mode, all warnings clean.

## Releases

Releases are cut from `main`. Tag `vX.Y.Z`, then `pnpm publish`. CI runs `typecheck`, `test`, and `build` on every PR.
