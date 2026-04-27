// Git diff acquisition and parsing.
//
// We shell out to `git` rather than depending on a JS git library: the spawn
// is cheap, the output format is stable enough across versions, and avoiding
// `nodegit`/`isomorphic-git` keeps the install footprint tiny.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

import { logger } from "../logger.js";

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed";

export interface DiffHunk {
  // 1-indexed line numbers in the OLD file where this hunk starts.
  oldStart: number;
  oldLines: number;
  // 1-indexed line numbers in the NEW file where this hunk starts.
  newStart: number;
  newLines: number;
  // The lines, prefixed with " " (context), "+" (added), or "-" (removed).
  lines: string[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  hunks: DiffHunk[];
  // Lines added in the new content (1-indexed line numbers).
  addedLines: Set<number>;
  // Lines removed in the old content (1-indexed line numbers).
  removedLines: Set<number>;
  // The file content. Lazily filled by collectDiff.
  newContent?: string;
  oldContent?: string;
}

export interface ParsedDiff {
  files: FileDiff[];
  repoRoot: string;
  baseRef?: string;
  headRef?: string;
}

export interface CollectOptions {
  cwd: string;
  mode: "staged" | "last-commit" | "branch" | "working-tree";
  baseRef?: string;
  files?: string[];
}

const BINARY_MARKER = "Binary files ";

function runGit(cwd: string, args: string[]): string {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out;
  } catch (err: any) {
    const msg = err?.stderr?.toString?.() ?? err?.message ?? String(err);
    throw new Error(`git ${args.join(" ")} failed: ${msg.trim()}`);
  }
}

export function findRepoRoot(cwd: string): string {
  const out = runGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
  if (!out) throw new Error("Not inside a git repository.");
  return out;
}

function parseRangeHeader(header: string): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} | null {
  // Matches @@ -oldStart,oldLines +newStart,newLines @@
  const match = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!match) return null;
  const oldStart = Number(match[1]);
  const oldLines = match[2] !== undefined ? Number(match[2]) : 1;
  const newStart = Number(match[3]);
  const newLines = match[4] !== undefined ? Number(match[4]) : 1;
  return { oldStart, oldLines, newStart, newLines };
}

function parseUnifiedDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.startsWith("diff --git")) {
      i++;
      continue;
    }

    // Each file block starts with `diff --git a/old b/new`
    const headerMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    let path = headerMatch?.[2] ?? "";
    let oldPath = headerMatch?.[1] ?? "";
    let status: FileStatus = "modified";
    let binary = false;
    const hunks: DiffHunk[] = [];

    i++;

    // Walk metadata lines until the first hunk or next file header.
    while (i < lines.length) {
      const meta = lines[i];
      if (meta === undefined) break;
      if (meta.startsWith("diff --git ")) break;
      if (meta.startsWith("@@ ")) break;

      if (meta.startsWith("new file mode")) status = "added";
      else if (meta.startsWith("deleted file mode")) status = "deleted";
      else if (meta.startsWith("rename from")) {
        status = "renamed";
        oldPath = meta.slice("rename from ".length).trim();
      } else if (meta.startsWith("rename to")) {
        path = meta.slice("rename to ".length).trim();
      } else if (meta.startsWith("copy from")) {
        status = "copied";
        oldPath = meta.slice("copy from ".length).trim();
      } else if (meta.startsWith("copy to")) {
        path = meta.slice("copy to ".length).trim();
      } else if (
        meta.startsWith(BINARY_MARKER) ||
        meta.startsWith("GIT binary patch")
      ) {
        binary = true;
      } else if (meta.startsWith("--- ")) {
        const p = meta.slice(4).trim();
        if (p !== "/dev/null" && p.startsWith("a/")) oldPath = p.slice(2);
      } else if (meta.startsWith("+++ ")) {
        const p = meta.slice(4).trim();
        if (p !== "/dev/null" && p.startsWith("b/")) path = p.slice(2);
      }

      i++;
    }

    // Hunks
    while (i < lines.length) {
      const h = lines[i];
      if (h === undefined) break;
      if (h.startsWith("diff --git ")) break;
      if (!h.startsWith("@@ ")) {
        i++;
        continue;
      }

      const range = parseRangeHeader(h);
      if (!range) {
        i++;
        continue;
      }
      const hunkLines: string[] = [];
      i++;
      while (i < lines.length) {
        const hl = lines[i];
        if (hl === undefined) break;
        if (hl.startsWith("diff --git ")) break;
        if (hl.startsWith("@@ ")) break;
        // Skip the "\ No newline at end of file" marker.
        if (hl.startsWith("\\ ")) {
          i++;
          continue;
        }
        hunkLines.push(hl);
        i++;
      }
      hunks.push({ ...range, lines: hunkLines });
    }

    const addedLines = new Set<number>();
    const removedLines = new Set<number>();
    for (const hunk of hunks) {
      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;
      for (const hl of hunk.lines) {
        if (hl.startsWith("+")) {
          addedLines.add(newLine);
          newLine++;
        } else if (hl.startsWith("-")) {
          removedLines.add(oldLine);
          oldLine++;
        } else {
          oldLine++;
          newLine++;
        }
      }
    }

    files.push({
      path,
      oldPath: oldPath && oldPath !== path ? oldPath : undefined,
      status: status === "modified" && !path ? "deleted" : status,
      binary,
      hunks,
      addedLines,
      removedLines,
    });
  }

  return files;
}

function gitDiffArgs(opts: CollectOptions): string[] {
  const diffOpts = ["--no-color", "--find-renames", "--find-copies", "--no-ext-diff"];
  if (opts.mode === "staged") {
    return ["--no-pager", "diff", "--cached", ...diffOpts];
  }
  if (opts.mode === "last-commit") {
    return ["--no-pager", "diff", "HEAD~1", "HEAD", ...diffOpts];
  }
  if (opts.mode === "branch") {
    const base = opts.baseRef || "main";
    return ["--no-pager", "diff", `${base}...HEAD`, ...diffOpts];
  }
  return ["--no-pager", "diff", "HEAD", ...diffOpts];
}

function readFileContent(repoRoot: string, path: string, ref?: string): string | undefined {
  if (ref) {
    const result = spawnSync("git", ["show", `${ref}:${path}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status === 0) return result.stdout;
    return undefined;
  }
  const abs = isAbsolute(path) ? path : resolve(repoRoot, path);
  if (!existsSync(abs)) return undefined;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return undefined;
  }
}

function refsForMode(mode: CollectOptions["mode"], baseRef?: string): {
  oldRef: string | undefined;
  newRef: string | undefined;
} {
  switch (mode) {
    case "staged":
      // Old = HEAD, new = index. We approximate "new" with the working tree
      // because that's what the developer is about to commit.
      return { oldRef: "HEAD", newRef: undefined };
    case "last-commit":
      return { oldRef: "HEAD~1", newRef: "HEAD" };
    case "branch":
      return { oldRef: baseRef || "main", newRef: "HEAD" };
    case "working-tree":
      return { oldRef: "HEAD", newRef: undefined };
  }
}

export function collectDiff(opts: CollectOptions): ParsedDiff {
  const log = logger().child("diff");
  const repoRoot = findRepoRoot(opts.cwd);
  const args = gitDiffArgs(opts);
  if (opts.files && opts.files.length > 0) {
    args.push("--", ...opts.files);
  }
  log.debug("git", args.join(" "));
  const raw = runGit(repoRoot, args);
  const files = parseUnifiedDiff(raw);
  const { oldRef, newRef } = refsForMode(opts.mode, opts.baseRef);

  // Populate file content so detectors don't all have to re-shell.
  for (const f of files) {
    if (f.binary) continue;
    if (f.status !== "added") {
      f.oldContent = readFileContent(repoRoot, f.oldPath ?? f.path, oldRef);
    }
    if (f.status !== "deleted") {
      f.newContent = readFileContent(repoRoot, f.path, newRef);
    }
  }

  return { files, repoRoot, baseRef: oldRef, headRef: newRef };
}

// Helper: convert a 1-indexed line number to its content in the new version.
export function lineAt(content: string | undefined, line: number): string {
  if (!content) return "";
  const lines = content.split("\n");
  return lines[line - 1] ?? "";
}

// Helper: extract a snippet of `count` lines centered (roughly) on `line`.
export function snippetAround(
  content: string | undefined,
  line: number,
  count = 3
): string {
  if (!content) return "";
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - Math.floor(count / 2));
  const end = Math.min(lines.length, start + count);
  return lines.slice(start, end).join("\n");
}

// For tests that want to feed in raw git diff output directly.
export function parseRawDiff(raw: string, repoRoot = "/tmp"): ParsedDiff {
  return { files: parseUnifiedDiff(raw), repoRoot };
}

// Resolves the path for a FileDiff relative to the repo root. Handles renames.
export function resolveFilePath(repoRoot: string, fd: FileDiff): string {
  return resolve(repoRoot, fd.path);
}

export function relativeToRepo(repoRoot: string, abs: string): string {
  return relative(repoRoot, abs);
}
