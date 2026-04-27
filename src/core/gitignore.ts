// Read .gitignore patterns and convert them to a quick predicate. Implements
// the subset of gitignore semantics that matters for skipping diff files:
//
//   - blank lines and `#` comments are ignored
//   - `!pattern` negates a previous match
//   - `**` matches any number of path segments
//   - `*` matches anything except `/`
//   - trailing `/` means "directory"
//   - leading `/` anchors to repo root; otherwise the pattern matches at any depth
//
// We don't try to be a perfect gitignore parser (subtle nested-`.gitignore`
// rules are out of scope). The goal is "if git would ignore it, skip it".

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Rule {
  re: RegExp;
  negate: boolean;
}

export function loadGitignoreRules(repoRoot: string): Rule[] {
  const rules: Rule[] = [];
  const path = join(repoRoot, ".gitignore");
  if (!existsSync(path)) return rules;
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return rules;
  }
  for (let raw of content.split("\n")) {
    raw = raw.trim();
    if (!raw || raw.startsWith("#")) continue;
    const negate = raw.startsWith("!");
    if (negate) raw = raw.slice(1);
    rules.push({ re: gitignoreToRegex(raw), negate });
  }
  return rules;
}

export function isGitignored(path: string, rules: Rule[]): boolean {
  let ignored = false;
  for (const r of rules) {
    if (r.re.test(path)) ignored = !r.negate;
  }
  return ignored;
}

function gitignoreToRegex(raw: string): RegExp {
  let p = raw;
  const trailingSlash = p.endsWith("/");
  if (trailingSlash) p = p.slice(0, -1);
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);

  // Escape regex metacharacters except for our glob chars.
  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<DS>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DS>>/g, ".*")
    .replace(/\?/g, "[^/]");

  let body: string;
  if (anchored) {
    body = trailingSlash ? `^${escaped}(/.*)?$` : `^${escaped}(/.*)?$`;
  } else {
    body = trailingSlash
      ? `(^|/)${escaped}(/.*)?$`
      : `(^|/)${escaped}(/.*)?$`;
  }
  return new RegExp(body);
}
