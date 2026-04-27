# The 35 bugs AI coding agents commit

AI coding agents — Claude Code, Codex, Cursor, Aider, OpenHands, and the rest — write code competently most of the time. But they fail in a *different* shape than humans do. Human reviewers, trained on a decade of code review for human-authored code, miss most of the new failure profile.

This document is a working taxonomy of 35 patterns we've seen agents repeatedly produce in production use. It is the source of truth for [agent-review](https://github.com/agent-review/agent-review): every entry maps to a detector that runs against your diff.

The taxonomy is split into two parts:

- **Static (AR001–AR025)**: deterministic detectors. Run with no API key, no network, no LLM call. Fast, cheap, free.
- **LLM-augmented (AR026–AR035)**: fuzzier patterns that need a model to spot. Opt-in via `--llm`.

If you spot a pattern that isn't here, please [open an issue](https://github.com/agent-review/agent-review/issues/new?template=new-detector.md) — every contribution makes the taxonomy stronger.

---

## Why agents fail differently

Three structural differences between human and agent failure profiles drive the taxonomy.

**Agents over-build.** They speculate about what helpers will be useful and leave them in even when the rest of the change doesn't end up calling them. Result: dead code, phantom types, orphaned files.

**Agents pattern-match across languages.** They confidently invoke `array.contains()` in JavaScript, `len.x()` in Python, `unwrap_or_panic()` in Rust. The signature looks plausible because *some* language has it. None of these.

**Agents focus on the happy path.** They implement what passes the example, then stop. Edge cases, error paths, and contract drift escape the loop.

Each entry below explains the pattern, why agents do it, and how `agent-review` detects it.

---

## Table of contents

| ID | Title | Severity | Type |
|----|-------|----------|------|
| [AR001](#ar001-dead-code-introduced) | Dead code introduced | Medium | Static |
| [AR002](#ar002-unused-imports) | Unused imports | Low | Static |
| [AR003](#ar003-commented-out-code-left-behind) | Commented-out code left behind | Low | Static |
| [AR004](#ar004-drive-by-refactor) | Drive-by refactor | Medium | Static |
| [AR005](#ar005-hallucinated-package-import) | Hallucinated package import | High | Static |
| [AR006](#ar006-hallucinated-method-or-property) | Hallucinated method or property | High | Static |
| [AR007](#ar007-phantom-type-or-interface) | Phantom type or interface | Low | Static |
| [AR008](#ar008-over-defensive-null-check) | Over-defensive null check | Low | Static |
| [AR009](#ar009-stale-comment) | Stale comment | Low | Static |
| [AR010](#ar010-test-without-assertion) | Test without assertion | High | Static |
| [AR011](#ar011-mock-leaked-into-production-code) | Mock leaked into production code | High | Static |
| [AR012](#ar012-debug-print-left-behind) | Debug print left behind | Medium | Static |
| [AR013](#ar013-todofixme-introduced) | TODO/FIXME introduced | Medium | Static |
| [AR014](#ar014-inconsistent-naming-convention) | Inconsistent naming convention | Low | Static |
| [AR015](#ar015-duplicate-error-handling) | Duplicate error handling | Low | Static |
| [AR016](#ar016-orphaned-new-file) | Orphaned new file | Medium | Static |
| [AR017](#ar017-silent-or-swallowed-catch) | Silent or swallowed catch | High | Static |
| [AR018](#ar018-hardcoded-credential) | Hardcoded credential | Critical | Static |
| [AR019](#ar019-broad-exception-catch) | Broad exception catch | Medium | Static |
| [AR020](#ar020-magic-number-introduced) | Magic number introduced | Low | Static |
| [AR021](#ar021-sleep-in-test) | Sleep in test | Medium | Static |
| [AR022](#ar022-unawaited-promise) | Unawaited promise | High | Static |
| [AR023](#ar023-mutated-input-parameter) | Mutated input parameter | Medium | Static |
| [AR024](#ar024-import-cycle-introduced) | Import cycle introduced | High | Static |
| [AR025](#ar025-disabled-or-skipped-test) | Disabled or skipped test | High | Static |
| [AR026](#ar026-subtle-logic-error) | Subtle logic error | High | LLM |
| [AR027](#ar027-spec-drift-from-name-or-docstring) | Spec drift from name or docstring | High | LLM |
| [AR028](#ar028-unrequested-feature-added) | Unrequested feature added | Medium | LLM |
| [AR029](#ar029-missing-edge-case) | Missing edge case | Medium | LLM |
| [AR030](#ar030-unhandled-error-path) | Unhandled error path | High | LLM |
| [AR031](#ar031-redundant-abstraction) | Redundant abstraction | Low | LLM |
| [AR032](#ar032-changed-public-contract) | Changed public contract | High | LLM |
| [AR033](#ar033-silently-changed-behavior) | Silently changed behavior | High | LLM |
| [AR034](#ar034-fabricated-citation) | Fabricated citation | Medium | LLM |
| [AR035](#ar035-incomplete-implementation) | Incomplete implementation | High | LLM |

---

## Static detectors

### AR001: Dead code introduced

A function, variable, type, or class added in this diff is never referenced anywhere in the new code.

**Why agents do this.** Agents over-build. They speculate about what helpers will be useful and leave them in even when the rest of the change doesn't end up calling them. The hallucination here isn't an API call — it's the assumption that the new helper is needed.

```js
// Before
function fetchUser(id) { return db.find(id); }

// After (agent-introduced dead code)
function fetchUser(id) { return db.find(id); }
function fetchUserByEmail(email) { return db.findByEmail(email); } // never called
```

**How agent-review detects it.** We parse the added lines for top-level declarations (functions, methods, classes, top-level consts) and walk every other file in the diff plus the file itself looking for references. Exported items are skipped (consumers may live in unchanged files). Auto-safe fix: remove the declaration when confidence is high.

---

### AR002: Unused imports

An import added in the diff is not referenced anywhere in the file.

**Why agents do this.** Agents often import "just in case" modules they considered using, then refactor away from that approach without removing the import.

```ts
// After
import { useState, useEffect, useMemo } from "react"; // useMemo never used
```

**How agent-review detects it.** Parse imports per language (TS/JS/Python at minimum), then check whether each named binding appears anywhere in the file body outside its own import line. Auto-safe fix: drop the unused name.

---

### AR003: Commented-out code left behind

Two or more consecutive comment lines that look like commented-out code rather than prose.

**Why agents do this.** Agents preserve old code as comments "for reference" or to show what changed, rather than relying on git history.

```js
// function login(user) { return authenticate(user) }
// function logout(user) { return signOut(user) }
function login(user, ctx) { return authenticate(user, ctx); }
```

**How agent-review detects it.** A heuristic that scores each comment line on whether it looks code-like (parens, `=`, `;`, language keywords) and fires when at least two consecutive added lines clear the bar. Auto-safe fix: remove the run.

---

### AR004: Drive-by refactor

A file was reformatted, renamed, or restructured in a way that's orthogonal to the apparent task of the diff.

**Why agents do this.** Agents run formatters or "tidy up while they're there." This balloons review surface area and obscures the real change.

```diff
- const x = 1; const y = 2; const z = 3
+ const x = 1
+ const y = 2
+ const z = 3
```

**How agent-review detects it.** Counts hunks where 0–25% of additions contain functional tokens (`return`, `throw`, `await`, comparison operators, control flow). Only fires when the diff has more than one file (so it doesn't misclassify the user's actual single-file refactor). Suggestion: split into a separate commit.

---

### AR005: Hallucinated package import

An import statement references a package that does not appear in the project's manifest.

**Why agents do this.** Agents pattern-match on what "looks right" for similar problems and invent package names that sound plausible.

```python
import json
import pyjwt_lite  # not installed; agent hallucinated the name
```

**How agent-review detects it.** Reads `package.json`, `requirements.txt`/`pyproject.toml`, `go.mod`, and `Cargo.toml`. For each added import, checks the package against the declared dependencies and the language's standard library. Local imports (`./`, `@/`, `~/`) are exempted.

---

### AR006: Hallucinated method or property

A method called on a known stdlib or popular-library type that doesn't exist on it.

**Why agents do this.** Agents conflate APIs across languages. JavaScript arrays have `.includes`, not `.contains`. Python strings use `in`, not `.contains`. Rust doesn't have `.unwrap_or_panic`.

```js
if (haystack.contains(needle)) { ... } // should be .includes
```

**How agent-review detects it.** A curated dictionary of "looks plausible but doesn't exist" pairs across JS/TS, Python, Go, and Rust. Each entry has a regex and a corrective hint.

---

### AR007: Phantom type or interface

A TypeScript type alias or interface declared in this diff and never used.

**Why agents do this.** Agents type-define ahead, then implement in a way that drops the abstraction.

```ts
interface UserSnapshot { id: string; name: string }
function load(): User { ... } // UserSnapshot never used
```

**How agent-review detects it.** Parses `type X = ...` and `interface X { ... }` declarations; checks references across the file and other diff files. Exported types are skipped (consumers may live elsewhere). Auto-safe fix: remove the declaration.

---

### AR008: Over-defensive null check

A null/undefined check on a value the surrounding code already guarantees is non-null.

**Why agents do this.** Agents add belt-and-suspenders checks because they don't fully trust the type system or the surrounding code.

```ts
const user = getUser(); // returns User, not User | null
if (!user) return null;
return user.name;
```

**How agent-review detects it.** Heuristic: if the check immediately follows an assignment whose RHS is a literal, an array/object construction, or a `new X(...)`, the check is redundant. Confidence is low; this is advisory.

---

### AR009: Stale comment

A comment immediately above (or as a docstring inside) a changed function references variables, parameters, or behavior that no longer exists in the new code.

**Why agents do this.** Agents update code but leave the docstring alone, especially when the comment was generated by an earlier agent run.

```ts
// Returns the user's email
function getName(user) { return user.name; }
```

**How agent-review detects it.** Looks at JSDoc/Python docstring above functions touched in the diff, extracts identifiers in backticks, and checks they still appear in the function body. AR027 (LLM) catches richer drift.

---

### AR010: Test without assertion

A `test`, `it`, or `describe` block (or Python `def test_*`) added with no assertion call inside.

**Why agents do this.** Agents create test scaffolding to look thorough, then forget the assertion or leave a placeholder.

```js
test("login works", () => {
  const r = login();
}); // no expect / assert
```

**How agent-review detects it.** Scans the body of any test block introduced or modified in the diff for known assertion tokens (`expect(`, `.toBe(`, `assert ...`, `pytest.raises`, etc.). Fires only when none are present.

---

### AR011: Mock leaked into production code

Identifiers like `mockFoo`, `fakeBar`, `dummyBaz`, `stub*`, `TODO_REPLACE` introduced in non-test files.

**Why agents do this.** When the agent moved from a test scaffold to a production implementation, it left a mock value behind.

```ts
const apiBase = "https://mockapi.local"; // TODO_REPLACE
```

**How agent-review detects it.** Pattern match against a curated set of mock identifier prefixes and placeholder URLs in any non-test file. Comments are excluded.

---

### AR012: Debug print left behind

`console.log`, `print()`, `fmt.Println`, `dbg!()` introduced in non-test source files.

**Why agents do this.** Agents instrument while reasoning and forget to remove the prints before declaring the task done.

```ts
function process(items) {
  console.log("items", items);
  return items.map(transform);
}
```

**How agent-review detects it.** Scans added lines for language-appropriate print patterns. Skips CLI/scripts directories where prints are intended output. Auto-safe fix: remove the line.

---

### AR013: TODO/FIXME introduced

TODO, FIXME, XXX, or HACK comments added in the diff.

**Why agents do this.** Agents acknowledge incomplete work in comments instead of finishing or surfacing it explicitly.

```ts
function pay(amount) {
  // TODO: handle fractional cents
  return charge(amount);
}
```

**How agent-review detects it.** Regex match on `\b(TODO|FIXME|XXX|HACK)\b` in added comment lines.

---

### AR014: Inconsistent naming convention

An identifier added in this diff uses a naming convention different from the surrounding file.

**Why agents do this.** Agents have strong priors from training data; in a snake_case Python repo they sometimes drop a camelCase helper.

```py
def get_user(id): ...
def getUserByEmail(email): ...  # camelCase in a snake_case repo
```

**How agent-review detects it.** Once per run, sample existing files in the repo and infer the dominant convention per language. Fire on added identifiers that violate it. ALL_CAPS constants are exempt.

---

### AR015: Duplicate error handling

The same try/catch wrapping pattern repeated in two or more places where one wrapper would suffice.

**Why agents do this.** Agents add per-call error handling defensively without considering the call site's existing error boundary.

```js
try { a() } catch (e) { logErr(e) }
try { b() } catch (e) { logErr(e) }
try { c() } catch (e) { logErr(e) }
```

**How agent-review detects it.** Hashes the body of each catch block in the file; flags repeated hashes when at least one of the catches was introduced in the diff.

---

### AR016: Orphaned new file

A file added in the diff that no other file in the repo imports, requires, or references.

**Why agents do this.** Agents create modules and forget to wire them up, especially in larger refactors.

**How agent-review detects it.** For each added file, check whether its stem appears in any string-quoted reference across the diff and the broader repo (we cap the scan at 4000 files for speed). Common entry points (`index`, `main`, `__init__`, `lib`, `mod`) are exempt.

---

### AR017: Silent or swallowed catch

A try/catch where the catch body is empty, only re-throws, only logs, or only returns null.

**Why agents do this.** Agents add catch blocks to make the type checker or test pass and silence the error path.

```js
try { fn() } catch (e) { /* swallow */ }
```

**How agent-review detects it.** Locates catch blocks (or Python `except:`) where the body, after trimming, is empty / contains only a single `console.log` / contains only `pass` or `return`.

---

### AR018: Hardcoded credential

A string literal matching common API key, token, or secret patterns added in the diff.

**Why agents do this.** Agents inline credentials from examples or test data without recognizing them as secrets.

```ts
const key = "sk-proj-abc123def456...";
```

**How agent-review detects it.** Regex match against known secret formats: OpenAI/Anthropic keys, AWS access keys, GitHub tokens, GitLab tokens, Slack tokens, bearer tokens, PEM headers, and inline `password: "..."` literals. Fixture and example directories are exempt to avoid false positives in test data.

---

### AR019: Broad exception catch

`except:`, `except Exception:`, or untyped `catch (e)` introduced where narrow handlers existed before.

**Why agents do this.** Agents widen catches to make tests pass when the real failure is upstream.

**How agent-review detects it.** For Python, fires on any added `except:` or `except Exception:`. For TS/JS, fires only when the previous version of the file had a typed catch and the new one doesn't.

---

### AR020: Magic number introduced

A numeric literal introduced in code that previously used named constants for the same domain.

**Why agents do this.** Agents inline values when they don't see the named constant or don't realize one exists.

```js
if (status === STATUS_OK) ... // before
if (status === 200) ...        // after
```

**How agent-review detects it.** Builds a map of `CONSTANT = number` declarations in the new file; flags added literals matching values that have a named constant.

---

### AR021: Sleep in test

`setTimeout`, `await sleep`, `time.sleep`, or `Thread.sleep` introduced in test files.

**Why agents do this.** Agents paper over flaky async tests with sleeps instead of waiting for an event.

**How agent-review detects it.** Pattern match per language, restricted to files matching test conventions.

---

### AR022: Unawaited promise

An async function whose return value is discarded inside another async function.

**Why agents do this.** Agents drop awaits when the type signature appears to be sync, especially after refactors.

```ts
async function persist() {
  save(record); // returns Promise<void>; not awaited
}
```

**How agent-review detects it.** Builds a set of identifiers that appear preceded by `await` somewhere in the same file. Within async-function regions, flags bare expression-statement calls of those identifiers.

---

### AR023: Mutated input parameter

A function parameter object mutated in a codebase whose convention is immutability.

**Why agents do this.** Agents reach for mutation as the shortest fix and ignore project conventions.

**How agent-review detects it.** Only fires when the file shows immutable signals (`Object.freeze`, `readonly`, `.map`/`.filter`/`.reduce`). Then flags `param.x = ...`, `Object.assign(param, ...)`, `param.push(...)`, `param.splice(...)` on parameters.

---

### AR024: Import cycle introduced

A new import edge that creates a cycle in the module graph.

**Why agents do this.** Agents pull in helpers from sibling modules without checking the resulting graph.

**How agent-review detects it.** Builds an import graph from the files in the diff, then for each added relative import checks whether following its edges leads back to the importing file.

---

### AR025: Disabled or skipped test

`it.skip`, `xit`, `describe.skip`, `@pytest.mark.skip`, `t.Skip()`, `#[ignore]` added or modified in the diff.

**Why agents do this.** When agents can't make a test pass, they sometimes skip it to ship.

**How agent-review detects it.** Pattern match across testing frameworks for JS/TS, Python, Go, and Rust.

---

## LLM-augmented detectors

These ten detectors require an LLM. Pass `--llm` to enable. We send the changed file (truncated) and the diff snippet to the configured provider; the model returns a structured JSON array of findings, which we then validate against a strict schema.

Cost note: each file under review = one model call. With Claude Haiku 4.5, a typical 200-line diff costs well under a cent per review.

### AR026: Subtle logic error

An off-by-one, inverted condition, swapped operand, or wrong operator that the surrounding context (function name, docstring, test) implies should be different.

```ts
// Before: includes only positive counts
if (count > 0) { ... }
// After: now includes zero
if (count >= 0) { ... }
```

The model is asked to flag this only when the contract elsewhere in the file makes the intent obvious. Confidence is set to "low" when uncertain.

---

### AR027: Spec drift from name or docstring

The implementation does something materially different from what the function name or docstring promises.

```ts
/** Returns active users */
function activeUsers(users: User[]): User[] {
  return users; // no filter — drifted from contract
}
```

This is the LLM-flavored cousin of AR009 (static stale-comment detection). AR027 catches drift even when no specific identifier in the comment is missing from the body.

---

### AR028: Unrequested feature added

Code added that implements behavior beyond the apparent scope of the diff.

A "fix login bug" PR that also adds a metrics middleware and a feature-flag client is the canonical example. The model is asked to consider the diff's commit message, comments, and dominant changes as the apparent scope.

---

### AR029: Missing edge case

Changed function visibly omits an edge case that a careful human reviewer would handle.

```ts
function median(xs: number[]): number {
  return xs[xs.length / 2 | 0]; // empty? even-length? unsorted?
}
```

Common omissions: empty input, null/undefined, boundary value, division by zero, integer overflow, off-by-one at array edges.

---

### AR030: Unhandled error path

New code that calls a fallible operation (network, file system, JSON parse, regex compile) without handling failure.

```ts
const cfg = JSON.parse(fs.readFileSync("cfg.json", "utf8"));
// throws if file missing or JSON invalid
```

The model only fires when the failure mode is *new* — pre-existing risky calls aren't agent-introduced.

---

### AR031: Redundant abstraction

A new helper or wrapper that adds an indirection without simplifying anything material.

```ts
function persistEntity(e: Entity) { save(e); } // wrapper over a single call
```

Agents wrap to feel like they're adding structure; the wrapper does nothing the inline call wouldn't.

---

### AR032: Changed public contract

A modified function signature, exported type, or public API in a way the user likely didn't request.

The model is constrained to fire only on items that are exported or otherwise public to consumers outside the file. Internal refactors don't trigger this.

---

### AR033: Silently changed behavior

Code that looks like a refactor but changes observable behavior — default value, error message, status code, log level.

```diff
- throw new Error("not found"); // mapped to 404 by middleware
+ throw new Error("missing");    // now mapped to 500
```

The most insidious agent failure mode: a clean diff, passing tests, broken production.

---

### AR034: Fabricated citation

A comment or string referencing a spec, RFC, ticket, or doc URL that doesn't exist or doesn't say what's claimed.

```ts
// per RFC 9999, section 4.7 — no such RFC exists
```

The model uses its own knowledge cutoff plus the provided context to flag implausible citations. False positives are possible; confidence is set to "low" by default.

---

### AR035: Incomplete implementation

A function body that contains a placeholder (`pass`, `return null`, `// implementation pending`, `throw new Error("not implemented")`) where the diff implies the function should be complete.

```python
def refund(order):
    """Issue a full refund to the customer."""
    pass  # placeholder; not what the diff claims
```

The most embarrassing agent failure mode: a confident "done" with a stubbed function.

---

## Contributing a new failure mode

We accept new detector proposals via [GitHub issues](https://github.com/agent-review/agent-review/issues/new?template=new-detector.md). Each proposal should include:

1. **Title** — short and descriptive.
2. **Example** — actual agent-generated code that exhibits the pattern. Anonymize as needed.
3. **Why it's distinctly an agent failure mode** — what makes this specific to AI-authored code rather than generic bad code.
4. **Proposed detection approach** — static (regex/AST) or LLM (with the proposed prompt fragment).
5. **Confidence** — high if the detector can be deterministic, lower if it would need LLM judgment.

Once accepted, the entry gets a stable ID (`AR0XX`) and a paired fixture in `test/fixtures/bad/`.

---

## Why this matters

AI agents are now writing meaningful fractions of new code in many codebases. The bugs they commit are real, but the failure profile is genuinely different from the bugs humans commit. Generic linters miss most of it; PR review by another agent catches some but introduces new failure modes; only a tool aimed at this specific surface fills the gap.

That's the bet behind agent-review: that the failure modes of AI agents are *catalogable* and *detectable*, and that having that catalog publicly visible helps the whole community ship more reliable AI-generated code.
