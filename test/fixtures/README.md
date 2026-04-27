# Detector fixtures

Each subdirectory under `bad/` corresponds to a detector ID and contains a `before.txt` / `after.txt` pair that demonstrates the failure mode. The `good/` directory contains diffs that should produce zero findings.

These fixtures are exercised by `test/detectors.test.ts` and serve as a regression suite when adding new detectors or modifying existing ones.

## Adding a fixture

1. Pick the detector ID directory (e.g. `bad/AR001/`).
2. Drop a `before.txt` (the original file) and `after.txt` (the post-diff file).
3. Add an entry in `test/detectors.test.ts` that asserts the detector fires (for `bad/`) or does not fire (for `good/`).

Fixtures are intentionally minimal: each one demonstrates exactly one failure mode so regressions are easy to bisect.
