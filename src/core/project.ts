// Project-level information collected once per run and shared with detectors.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ProjectInfo } from "./detectors/types.js";

const SCAN_LIMIT = 4000;

export function collectProjectInfo(repoRoot: string): ProjectInfo {
  const ecosystems: ProjectInfo["ecosystems"] = [];
  const declaredDependencies = new Set<string>();

  // Node
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    ecosystems.push("node");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      for (const k of Object.keys(pkg.dependencies ?? {})) declaredDependencies.add(k);
      for (const k of Object.keys(pkg.devDependencies ?? {})) declaredDependencies.add(k);
      for (const k of Object.keys(pkg.peerDependencies ?? {})) declaredDependencies.add(k);
      for (const k of Object.keys(pkg.optionalDependencies ?? {})) declaredDependencies.add(k);
    } catch {
      // intentional: malformed package.json is OK to skip; deps stay empty
    }
  }

  // Python
  for (const f of [
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "setup.py",
    "setup.cfg",
  ]) {
    const p = join(repoRoot, f);
    if (existsSync(p)) {
      ecosystems.push("python");
      try {
        const content = readFileSync(p, "utf8");
        for (const m of content.matchAll(/^([a-zA-Z0-9_\-]+)(?:[<>=!~]|$)/gm)) {
          if (m[1]) declaredDependencies.add(m[1].toLowerCase());
        }
      } catch {
        // intentional: malformed manifest is fine; we just skip its deps
      }
      break;
    }
  }

  // Go: handle both single-line `require pkg ver` and the parenthesized
  // `require ( pkg ver ... )` block form.
  if (existsSync(join(repoRoot, "go.mod"))) {
    ecosystems.push("go");
    try {
      const content = readFileSync(join(repoRoot, "go.mod"), "utf8");
      for (const m of content.matchAll(/^\s*require\s+([\w.\-/]+)\s+v[\w.\-]+/gm)) {
        if (m[1]) declaredDependencies.add(m[1]);
      }
      // Inside a `require ( ... )` block, lines have the form `pkg ver`.
      const blockMatch = content.match(/require\s*\(([\s\S]*?)\)/);
      if (blockMatch?.[1]) {
        for (const m of blockMatch[1].matchAll(/^\s*([\w.\-/]+)\s+v[\w.\-]+/gm)) {
          if (m[1]) declaredDependencies.add(m[1]);
        }
      }
    } catch {
      // intentional: best-effort manifest parse; failures fall through
    }
  }

  // Rust
  if (existsSync(join(repoRoot, "Cargo.toml"))) {
    ecosystems.push("rust");
    try {
      const content = readFileSync(join(repoRoot, "Cargo.toml"), "utf8");
      for (const m of content.matchAll(/^([a-zA-Z0-9_\-]+)\s*=/gm)) {
        if (m[1]) declaredDependencies.add(m[1]);
      }
    } catch {
      // intentional: best-effort manifest parse; failures fall through
    }
  }

  const importedPaths = scanImportedPaths(repoRoot);
  const conventions = inferConventions(repoRoot);

  return { ecosystems, declaredDependencies, conventions, importedPaths };
}

function scanImportedPaths(repoRoot: string): Set<string> {
  const paths = new Set<string>();
  let scanned = 0;

  function walk(dir: string): void {
    if (scanned > SCAN_LIMIT) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // intentional: unreadable dir is fine to skip
    }
    for (const e of entries) {
      if (
        e === "node_modules" ||
        e === ".git" ||
        e === "dist" ||
        e === "build" ||
        e === "target" ||
        e === "__pycache__" ||
        e === ".venv"
      ) continue;
      const p = join(dir, e);
      let stats;
      try {
        stats = statSync(p);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(p);
      } else if (stats.isFile()) {
        paths.add(resolve(p));
        scanned++;
        if (scanned > SCAN_LIMIT) return;
      }
    }
  }

  walk(repoRoot);
  return paths;
}

function inferConventions(repoRoot: string): ProjectInfo["conventions"] {
  const sample: { js: { camel: number; snake: number }; py: { camel: number; snake: number } } = {
    js: { camel: 0, snake: 0 },
    py: { camel: 0, snake: 0 },
  };

  let scanned = 0;
  function walk(dir: string): void {
    if (scanned > 200) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // intentional: unreadable dir is fine to skip
    }
    for (const e of entries) {
      if (
        e === "node_modules" ||
        e === ".git" ||
        e === "dist" ||
        e === "build" ||
        e === "target" ||
        e === "__pycache__" ||
        e === ".venv" ||
        e === "test" ||
        e === "tests"
      ) continue;
      const p = join(dir, e);
      let stats;
      try {
        stats = statSync(p);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(p);
      } else if (stats.isFile()) {
        scanned++;
        try {
          const content = readFileSync(p, "utf8");
          if (/\.(js|ts|jsx|tsx|mjs)$/.test(e)) {
            const camel = (content.match(/\b[a-z][a-z0-9]+[A-Z][a-zA-Z0-9]+\b/g) || []).length;
            const snake = (content.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) || []).length;
            sample.js.camel += camel;
            sample.js.snake += snake;
          } else if (e.endsWith(".py")) {
            const camel = (content.match(/\b[a-z][a-z0-9]+[A-Z][a-zA-Z0-9]+\b/g) || []).length;
            const snake = (content.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) || []).length;
            sample.py.camel += camel;
            sample.py.snake += snake;
          }
        } catch {
          // intentional: skip unreadable files in convention sampling
        }
      }
    }
  }
  walk(repoRoot);

  const decide = (s: { camel: number; snake: number }): "camelCase" | "snake_case" | "mixed" | "unknown" => {
    if (s.camel + s.snake < 5) return "unknown";
    const ratio = s.camel / Math.max(1, s.snake);
    if (ratio > 3) return "camelCase";
    if (ratio < 0.33) return "snake_case";
    return "mixed";
  };

  return { js: decide(sample.js), py: decide(sample.py) };
}
