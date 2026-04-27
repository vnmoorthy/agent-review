// The 35-entry taxonomy of agent-introduced failure modes.
//
// Each entry pairs a stable ID (AR001..AR035) with metadata that drives the
// CLI output, the public TAXONOMY.md document, and the detector registry.
//
// Editing rules:
// - IDs are forever. Don't renumber. New entries get the next ID.
// - `severity` is the *default*; specific findings can deviate.
// - `detectionType: "static"` means we ship a deterministic detector;
//   `"llm"` means it's only caught by the optional LLM pass.

import type { Severity } from "../detectors/types.js";

export type Category =
  | "dead-code"
  | "drive-by"
  | "hallucination"
  | "spec-drift"
  | "test-quality"
  | "style-drift"
  | "safety"
  | "secrets"
  | "concurrency"
  | "other";

export type FixKind = "auto-safe" | "auto-risky" | "suggestion-only";
export type DetectionType = "static" | "llm" | "hybrid";

export interface TaxonomyEntry {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  detectionType: DetectionType;
  fixKind: FixKind;
  description: string;
  whyAgentsDoThis: string;
  example: { before: string; after: string };
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    id: "AR001",
    title: "Dead code introduced",
    category: "dead-code",
    severity: "medium",
    detectionType: "static",
    fixKind: "auto-safe",
    description:
      "A function, variable, type, or class added in this diff is never referenced anywhere else in the new code.",
    whyAgentsDoThis:
      "Agents over-build. They speculate about what helpers will be useful and leave them in even when the rest of the change doesn't end up calling them.",
    example: {
      before: "function fetchUser(id) { return db.find(id); }",
      after:
        "function fetchUser(id) { return db.find(id); }\nfunction fetchUserByEmail(email) { return db.findByEmail(email); } // never called",
    },
  },
  {
    id: "AR002",
    title: "Unused imports",
    category: "dead-code",
    severity: "low",
    detectionType: "static",
    fixKind: "auto-safe",
    description: "An import added in the diff is not referenced anywhere in the file.",
    whyAgentsDoThis:
      "Agents often import 'just in case' modules they considered using, then refactor away from that approach without removing the import.",
    example: {
      before: "import { useState } from 'react'",
      after: "import { useState, useEffect, useMemo } from 'react' // useMemo never used",
    },
  },
  {
    id: "AR003",
    title: "Commented-out code left behind",
    category: "dead-code",
    severity: "low",
    detectionType: "static",
    fixKind: "auto-safe",
    description:
      "Large blocks of comments that look like commented-out code rather than prose.",
    whyAgentsDoThis:
      "Agents preserve old code as comments 'for reference' or to show what changed, rather than relying on git history.",
    example: {
      before: "function login(user) { return authenticate(user) }",
      after:
        "// function login(user) { return authenticate(user) }\nfunction login(user, ctx) { return authenticate(user, ctx) }",
    },
  },
  {
    id: "AR004",
    title: "Drive-by refactor",
    category: "drive-by",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A file was reformatted, renamed, or restructured in a way that's orthogonal to the apparent task of the diff.",
    whyAgentsDoThis:
      "Agents run formatters or 'tidy up while they're there.' This balloons review surface area and obscures the real change.",
    example: {
      before: "const x = 1; const y = 2; const z = 3;",
      after: "const x = 1\nconst y = 2\nconst z = 3\n// also reformatted 80 lines we didn't touch",
    },
  },
  {
    id: "AR005",
    title: "Hallucinated package import",
    category: "hallucination",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "An import statement references a package that does not appear in the project's manifest (package.json, requirements.txt, go.mod, Cargo.toml).",
    whyAgentsDoThis:
      "Agents pattern-match on what 'looks right' for similar problems and invent package names that sound plausible.",
    example: {
      before: "import json",
      after: "import json\nimport pyjwt_lite  # not installed; agent hallucinated the name",
    },
  },
  {
    id: "AR006",
    title: "Hallucinated method or property",
    category: "hallucination",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A method called on a known stdlib or popular-library type that does not exist on that type.",
    whyAgentsDoThis:
      "Agents conflate APIs across languages (e.g., Python's `str.contains` doesn't exist; JS arrays have no `removeAll`).",
    example: {
      before: "if (haystack.includes(needle))",
      after: "if (haystack.contains(needle)) // arrays/strings have .includes, not .contains",
    },
  },
  {
    id: "AR007",
    title: "Phantom type or interface",
    category: "dead-code",
    severity: "low",
    detectionType: "static",
    fixKind: "auto-safe",
    description: "A type alias or interface declared in the diff and never referenced.",
    whyAgentsDoThis:
      "Agents type-define ahead, then implement in a way that drops the abstraction.",
    example: {
      before: "function load(): User { ... }",
      after: "interface UserSnapshot { id: string }\nfunction load(): User { ... } // UserSnapshot unused",
    },
  },
  {
    id: "AR008",
    title: "Over-defensive null check",
    category: "drive-by",
    severity: "low",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A null/undefined check on a value that the type system or assignment in the same scope guarantees is non-null.",
    whyAgentsDoThis:
      "Agents add belt-and-suspenders checks because they don't fully trust the type system or the surrounding code.",
    example: {
      before: "const user = getUser(); return user.name",
      after:
        "const user = getUser(); if (!user) return null; return user.name // getUser() return type is User, never null",
    },
  },
  {
    id: "AR009",
    title: "Stale comment",
    category: "drive-by",
    severity: "low",
    detectionType: "hybrid",
    fixKind: "suggestion-only",
    description:
      "A comment above or inside a changed function references variables, parameters, or behavior that no longer exists in the new code.",
    whyAgentsDoThis:
      "Agents update code but leave the docstring alone, especially when the comment was generated by an earlier agent run.",
    example: {
      before: "// Returns the user's email\nfunction getEmail(user) { return user.email }",
      after:
        "// Returns the user's email\nfunction getName(user) { return user.name } // comment is stale",
    },
  },
  {
    id: "AR010",
    title: "Test without assertion",
    category: "test-quality",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A `test`/`it`/`describe` (or Python equivalent) block was added with no `expect`/`assert`/`should` call inside.",
    whyAgentsDoThis:
      "Agents create test scaffolding to look thorough, then forget the assertion or leave a placeholder.",
    example: {
      before: "test('login works', () => { expect(login()).toBe(true) })",
      after: "test('login works', () => { const r = login() }) // no assertion",
    },
  },
  {
    id: "AR011",
    title: "Mock or fixture leaked into production code",
    category: "safety",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "Identifiers like `mockFoo`, `fakeBar`, `dummyBaz`, `stub*`, `TODO_REPLACE` introduced in non-test files.",
    whyAgentsDoThis:
      "When the agent moved from a test scaffold to a production implementation, it left a mock value behind.",
    example: {
      before: "const apiBase = process.env.API_BASE",
      after: "const apiBase = 'https://mockapi.local' // TODO_REPLACE",
    },
  },
  {
    id: "AR012",
    title: "Debug print left behind",
    category: "drive-by",
    severity: "medium",
    detectionType: "static",
    fixKind: "auto-safe",
    description:
      "`console.log`, `print()`, `fmt.Println`, `dbg!()` introduced in non-test source files.",
    whyAgentsDoThis:
      "Agents instrument while reasoning and forget to remove the prints before declaring the task done.",
    example: {
      before: "function process(items) { return items.map(transform) }",
      after: "function process(items) { console.log('items', items); return items.map(transform) }",
    },
  },
  {
    id: "AR013",
    title: "TODO/FIXME introduced",
    category: "drive-by",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description: "TODO, FIXME, XXX, or HACK comments added in the diff.",
    whyAgentsDoThis:
      "Agents acknowledge incomplete work in comments instead of finishing or surfacing it explicitly.",
    example: {
      before: "function pay(amount) { return charge(amount) }",
      after:
        "function pay(amount) { /* TODO: handle fractional cents */ return charge(amount) }",
    },
  },
  {
    id: "AR014",
    title: "Inconsistent naming convention",
    category: "style-drift",
    severity: "low",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "An identifier added in this diff uses a naming convention different from the surrounding file.",
    whyAgentsDoThis:
      "Agents have strong priors from training data; in a snake_case Python repo they sometimes drop a camelCase helper.",
    example: {
      before: "def get_user(id): ...",
      after: "def get_user(id): ...\ndef getUserByEmail(email): ... # camelCase in a snake_case repo",
    },
  },
  {
    id: "AR015",
    title: "Duplicate error handling",
    category: "drive-by",
    severity: "low",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "The same try/catch wrapping pattern repeated in two or more places where one wrapper would suffice.",
    whyAgentsDoThis:
      "Agents add per-call error handling defensively without considering the call site's existing error boundary.",
    example: {
      before: "try { a(); b(); c() } catch (e) { ... }",
      after:
        "try { a() } catch (e) { ... }\ntry { b() } catch (e) { ... }\ntry { c() } catch (e) { ... }",
    },
  },
  {
    id: "AR016",
    title: "Orphaned new file",
    category: "dead-code",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A file added in the diff that no other file in the repo imports, requires, or references.",
    whyAgentsDoThis:
      "Agents create modules and forget to wire them up, especially in larger refactors.",
    example: {
      before: "(no file)",
      after: "src/utils/parser.ts // not imported anywhere",
    },
  },
  {
    id: "AR017",
    title: "Silent or swallowed catch",
    category: "safety",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A try/catch where the catch body is empty, only re-throws, or only logs without surfacing.",
    whyAgentsDoThis:
      "Agents add catch blocks to make the type checker or test pass and silence the error path.",
    example: {
      before: "fn() ",
      after: "try { fn() } catch (e) { /* swallow */ }",
    },
  },
  {
    id: "AR018",
    title: "Hardcoded credential",
    category: "secrets",
    severity: "critical",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A string literal matching common API key, token, or secret patterns added in the diff.",
    whyAgentsDoThis:
      "Agents inline credentials from examples or test data without recognizing them as secrets.",
    example: {
      before: "const key = process.env.OPENAI_API_KEY",
      after: "const key = 'sk-proj-abc123def456...'",
    },
  },
  {
    id: "AR019",
    title: "Broad exception catch",
    category: "safety",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "`except:`, `except Exception:`, or `catch (e)` introduced where narrow handlers existed before.",
    whyAgentsDoThis:
      "Agents widen catches to make tests pass when the real failure is upstream.",
    example: {
      before: "except KeyError: ...",
      after: "except Exception: ...",
    },
  },
  {
    id: "AR020",
    title: "Magic number introduced",
    category: "drive-by",
    severity: "low",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A numeric literal introduced in code that previously used named constants for the same domain.",
    whyAgentsDoThis:
      "Agents inline values when they don't see the named constant or don't realize one exists.",
    example: {
      before: "if (status === STATUS_OK) ...",
      after: "if (status === 200) ...",
    },
  },
  {
    id: "AR021",
    title: "Sleep in test",
    category: "test-quality",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "`setTimeout`, `await sleep`, `time.sleep`, or `Thread.sleep` introduced in test files.",
    whyAgentsDoThis:
      "Agents paper over flaky async tests with sleeps instead of waiting for an event.",
    example: {
      before: "await waitFor(() => expect(...).toBe(...))",
      after: "await new Promise(r => setTimeout(r, 500)); expect(...).toBe(...)",
    },
  },
  {
    id: "AR022",
    title: "Unawaited promise / async-fn called sync",
    category: "concurrency",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A function returning a Promise called inside an async function without `await` or `.then`.",
    whyAgentsDoThis:
      "Agents drop awaits when the type signature appears to be sync, especially after refactors.",
    example: {
      before: "await save(record)",
      after: "save(record) // promise discarded",
    },
  },
  {
    id: "AR023",
    title: "Mutated input parameter",
    category: "safety",
    severity: "medium",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "A function parameter is mutated in a codebase whose convention is immutability.",
    whyAgentsDoThis:
      "Agents reach for mutation as the shortest fix and ignore project conventions.",
    example: {
      before: "function withUpdated(items, p) { return items.map(i => ({...i, ...p})) }",
      after: "function withUpdated(items, p) { items.forEach(i => Object.assign(i, p)); return items }",
    },
  },
  {
    id: "AR024",
    title: "Import cycle introduced",
    category: "drive-by",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description: "A new import edge that creates a cycle in the module graph.",
    whyAgentsDoThis:
      "Agents pull in helpers from sibling modules without checking the resulting graph.",
    example: {
      before: "// a.ts imports b.ts",
      after: "// b.ts imports a.ts (cycle)",
    },
  },
  {
    id: "AR025",
    title: "Disabled or skipped test",
    category: "test-quality",
    severity: "high",
    detectionType: "static",
    fixKind: "suggestion-only",
    description:
      "`it.skip`, `xit`, `describe.skip`, or `@pytest.mark.skip` added or modified in the diff.",
    whyAgentsDoThis:
      "When agents can't make a test pass, they sometimes skip it to ship.",
    example: {
      before: "test('handles refund', () => { ... })",
      after: "test.skip('handles refund', () => { ... })",
    },
  },
  // ---- LLM detectors ----
  {
    id: "AR026",
    title: "Subtle logic error",
    category: "spec-drift",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "An off-by-one, inverted condition, swapped operand, or wrong operator that the docstring or function name implies should be different.",
    whyAgentsDoThis:
      "Agents rewrite a condition while preserving the surrounding code and flip the polarity by accident.",
    example: {
      before: "if (count > 0)",
      after: "if (count >= 0) // accepts zero, contradicts docstring",
    },
  },
  {
    id: "AR027",
    title: "Spec drift from name or docstring",
    category: "spec-drift",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "The implementation does something materially different from what the function name or docstring promises.",
    whyAgentsDoThis:
      "Agents update behavior to match a test fixture or local example without revisiting the docstring's contract.",
    example: {
      before: "// returns active users\nfunction activeUsers() { return users.filter(u => u.active) }",
      after: "// returns active users\nfunction activeUsers() { return users }",
    },
  },
  {
    id: "AR028",
    title: "Unrequested feature added",
    category: "drive-by",
    severity: "medium",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "Code added that implements behavior beyond the apparent scope of the diff (e.g., a fix-login PR that also adds a logging system).",
    whyAgentsDoThis:
      "Agents see opportunities to 'improve while here' and keep building beyond the requested change.",
    example: {
      before: "// fixing login bug",
      after: "// fixed login bug + added a metrics middleware + a feature flag client",
    },
  },
  {
    id: "AR029",
    title: "Missing edge case",
    category: "spec-drift",
    severity: "medium",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "Changed function visibly omits an edge case that a careful human reviewer would handle (empty input, null, boundary).",
    whyAgentsDoThis:
      "Agents implement the happy path and stop when the example tests pass.",
    example: {
      before: "function median(xs) { /* handles empty + odd + even */ }",
      after: "function median(xs) { return xs[xs.length / 2 | 0] } // empty? even-length? sorting?",
    },
  },
  {
    id: "AR030",
    title: "Unhandled error path",
    category: "safety",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "New code calls a fallible operation (network, FS, parse, JSON) without handling failure.",
    whyAgentsDoThis:
      "Agents focus on the success path and forget that the operation can throw or return null.",
    example: {
      before: "const cfg = readConfig()",
      after: "const cfg = JSON.parse(fs.readFileSync('cfg.json'))",
    },
  },
  {
    id: "AR031",
    title: "Redundant abstraction",
    category: "drive-by",
    severity: "low",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "A new helper or wrapper that adds an indirection without simplifying anything material.",
    whyAgentsDoThis:
      "Agents wrap to feel like they're adding structure; the wrapper does nothing the inline call wouldn't.",
    example: {
      before: "save(user)",
      after: "function persistEntity(e) { save(e) } persistEntity(user)",
    },
  },
  {
    id: "AR032",
    title: "Changed public contract",
    category: "spec-drift",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "A modified function signature, exported type, or public API in a way the user likely didn't request.",
    whyAgentsDoThis:
      "Agents adjust signatures to make local code easier without considering external consumers.",
    example: {
      before: "export function publish(post: Post): Promise<Result>",
      after: "export function publish(post: Post, opts: PublishOpts): Promise<Result>",
    },
  },
  {
    id: "AR033",
    title: "Silently changed behavior",
    category: "spec-drift",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "Code that looks like a refactor but changes observable behavior (default value, error message, status code).",
    whyAgentsDoThis:
      "Agents 'tidy' values during a rename or extraction and shift behavior without noticing.",
    example: {
      before: "throw new Error('not found') // status 404",
      after: "throw new Error('missing') // status 500",
    },
  },
  {
    id: "AR034",
    title: "Fabricated citation",
    category: "hallucination",
    severity: "medium",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "A comment or string referencing a spec, RFC, ticket, or doc URL that doesn't exist or doesn't say what's claimed.",
    whyAgentsDoThis:
      "Agents fabricate plausible-sounding citations to justify a choice in a comment.",
    example: {
      before: "// per ISO-8601",
      after: "// per RFC 9999, section 4.7 (no such RFC)",
    },
  },
  {
    id: "AR035",
    title: "Incomplete implementation",
    category: "spec-drift",
    severity: "high",
    detectionType: "llm",
    fixKind: "suggestion-only",
    description:
      "A function body that contains a placeholder (`pass`, `return null`, `// implementation pending`) where the diff implies it should be complete.",
    whyAgentsDoThis:
      "Agents stub a function intending to come back, then declare the task done.",
    example: {
      before: "function refund(order) { ... full impl ... }",
      after: "function refund(order) { /* implementation pending */ return null }",
    },
  },
];

const BY_ID = new Map<string, TaxonomyEntry>(TAXONOMY.map((e) => [e.id, e]));

export function getTaxonomyEntry(id: string): TaxonomyEntry | undefined {
  return BY_ID.get(id);
}
