// Test helper: build a synthetic ParsedDiff from in-memory before/after pairs
// so detectors can be tested without invoking git.

import type {
  ParsedDiff,
  FileDiff,
  DiffHunk,
  FileStatus,
} from "../../src/core/git/diff.js";
import type { ProjectInfo } from "../../src/core/detectors/types.js";

export interface FixtureFile {
  path: string;
  before?: string;
  after: string;
  status?: FileStatus;
}

export function buildDiff(files: FixtureFile[], repoRoot = "/tmp/repo"): ParsedDiff {
  const diffFiles: FileDiff[] = files.map((f) => buildFileDiff(f));
  return { files: diffFiles, repoRoot };
}

function buildFileDiff(f: FixtureFile): FileDiff {
  const before = f.before ?? "";
  const after = f.after;
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const status: FileStatus =
    f.status ?? (before === "" ? "added" : "modified");

  // Build a single hunk that spans the file.
  const hunkLines: string[] = [];
  // Naive line-by-line diff: flag each line as added/removed/context.
  // For test purposes we mark every after-line that isn't in before as "+",
  // every before-line not in after as "-".
  const beforeSet = new Set(beforeLines.map((l, i) => `${i}|${l}`));
  for (let i = 0; i < afterLines.length; i++) {
    const key = `${i}|${afterLines[i]}`;
    if (beforeSet.has(key)) {
      hunkLines.push(" " + afterLines[i]);
    } else {
      hunkLines.push("+" + afterLines[i]);
    }
  }
  const hunk: DiffHunk = {
    oldStart: 1,
    oldLines: beforeLines.length,
    newStart: 1,
    newLines: afterLines.length,
    lines: hunkLines,
  };

  const addedLines = new Set<number>();
  const removedLines = new Set<number>();
  for (let i = 0; i < hunkLines.length; i++) {
    const line = hunkLines[i] ?? "";
    if (line.startsWith("+")) addedLines.add(i + 1);
  }
  // For "added" files, every line is added.
  if (status === "added") {
    addedLines.clear();
    for (let i = 1; i <= afterLines.length; i++) addedLines.add(i);
  }

  return {
    path: f.path,
    status,
    binary: false,
    hunks: [hunk],
    addedLines,
    removedLines,
    newContent: after,
    oldContent: before || undefined,
  };
}

export function emptyProject(extra?: Partial<ProjectInfo>): ProjectInfo {
  return {
    ecosystems: [],
    declaredDependencies: new Set<string>(),
    conventions: { js: "unknown", py: "unknown" },
    importedPaths: new Set<string>(),
    ...extra,
  } as ProjectInfo;
}
