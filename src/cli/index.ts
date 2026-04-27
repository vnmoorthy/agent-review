// agent-review CLI entry point. Wires diff acquisition, detector runner,
// output, and side-effecting commands (skill install, --apply-safe).

import { Command } from "commander";
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { collectDiff } from "../core/git/diff.js";
import { runDetectors } from "../core/detectors/index.js";
import { collectProjectInfo } from "../core/project.js";
import { defaultConfig, type RunConfig } from "../core/config.js";
import { applySafeFixes } from "../core/fixes/applier.js";
import { formatTerminal } from "./output/terminal.js";
import { formatMarkdown } from "./output/markdown.js";
import { formatJson } from "./output/json.js";
import { formatSarif } from "./output/sarif.js";
import { formatGithubAnnotations } from "./output/github.js";
import { formatJunit } from "./output/junit.js";
import { formatHtml } from "./output/html.js";
import { createLogger, setGlobalLogger } from "../core/logger.js";
import { TAXONOMY } from "../core/taxonomy/registry.js";
import type { Detector, Finding, Severity } from "../core/detectors/types.js";
import { loadConfigFile } from "../core/config-file.js";
import {
  defaultBaselinePath,
  filterAgainstBaseline,
  loadBaseline,
  saveBaseline,
} from "../core/baseline.js";
import { findRepoRoot } from "../core/git/diff.js";
import { loadCustomDetectors } from "../core/plugins.js";

const VERSION = "0.1.0";

function applyCliOverrides(cfg: RunConfig, opts: any): RunConfig {
  if (opts.staged) cfg.diffMode = "staged";
  if (opts.lastCommit) cfg.diffMode = "last-commit";
  if (opts.branch) {
    cfg.diffMode = "branch";
    cfg.baseRef = opts.branch === true ? "main" : opts.branch;
  }
  if (opts.workingTree) cfg.diffMode = "working-tree";
  if (opts.files) cfg.files = Array.isArray(opts.files) ? opts.files : [opts.files];
  if (opts.applySafe) cfg.applySafe = true;
  if (opts.json) cfg.output = "json";
  if (opts.markdown) cfg.output = "markdown";
  if (opts.sarif) cfg.output = "sarif";
  if (opts.github) cfg.output = "github";
  if (opts.junit) cfg.output = "junit";
  if (opts.html) cfg.output = "html";
  if (process.env.GITHUB_ACTIONS === "true" && !opts.json && !opts.markdown && !opts.sarif) {
    // Auto-emit GitHub annotations when running inside Actions and the user
    // hasn't asked for a specific machine-readable format.
    if (!opts.github) cfg.output = "github";
  }
  if (opts.severity) cfg.severityThreshold = opts.severity;
  if (opts.allow) cfg.detectorAllowlist = opts.allow.split(",").map((s: string) => s.trim());
  if (opts.deny) cfg.detectorDenylist = opts.deny.split(",").map((s: string) => s.trim());
  if (opts.failOn) cfg.failOn = opts.failOn;
  if (opts.noColor) cfg.noColor = true;
  if (opts.llm === false) cfg.llm.provider = "none";
  if (opts.llm === true) {
    if (cfg.llm.provider === "none") {
      // Auto-detect again now that the user explicitly asked.
      if (process.env.ANTHROPIC_API_KEY) cfg.llm.provider = "anthropic";
      else if (process.env.OLLAMA_BASE_URL) cfg.llm.provider = "ollama";
    }
  }
  if (opts.model) cfg.llm.model = opts.model;
  if (opts.ollamaUrl) {
    cfg.llm.baseUrl = opts.ollamaUrl;
    cfg.llm.provider = "ollama";
  }
  if (opts.openaiUrl) {
    cfg.llm.baseUrl = opts.openaiUrl;
    cfg.llm.provider = "openai";
    cfg.llm.apiKey = process.env.OPENAI_API_KEY ?? cfg.llm.apiKey;
  }
  if (opts.provider) {
    cfg.llm.provider = opts.provider;
    if (opts.provider === "openai" && !cfg.llm.apiKey)
      cfg.llm.apiKey = process.env.OPENAI_API_KEY;
  }
  if (opts.timeout) cfg.llm.timeoutMs = Number(opts.timeout) * 1000;
  if (opts.verbose) cfg.logLevel = "debug";
  if (opts.quiet) cfg.logLevel = "error";
  return cfg;
}

function filterBySeverity(findings: Finding[], threshold: Severity): Finding[] {
  const order: Severity[] = ["info", "low", "medium", "high", "critical"];
  const idx = order.indexOf(threshold);
  return findings.filter((f) => order.indexOf(f.severity) >= idx);
}

function exitCode(failOn: RunConfig["failOn"], findings: Finding[]): number {
  if (failOn === "never") return 0;
  if (failOn === "any" && findings.length > 0) return 2;
  if (failOn === "high" && findings.some((f) => f.severity === "high" || f.severity === "critical"))
    return 2;
  if (failOn === "critical" && findings.some((f) => f.severity === "critical")) return 2;
  return 0;
}

function fatal(err: unknown): never {
  process.stderr.write(`agent-review: ${(err as Error)?.message ?? err}\n`);
  process.exit(1);
}

async function reviewCommand(opts: any): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const cfg = applyCliOverrides(defaultConfig(cwd), opts);
  setGlobalLogger(createLogger(cfg.logLevel));

  let diff;
  try {
    diff = collectDiff({ cwd, mode: cfg.diffMode, baseRef: cfg.baseRef, files: cfg.files });
  } catch (err: any) {
    fatal(err);
  }

  if (opts.printDiff) {
    process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    return;
  }

  // Load project config file.
  let projectConfig = null;
  try {
    projectConfig = loadConfigFile(diff.repoRoot);
  } catch (err: any) {
    fatal(err);
  }

  // Apply config-level severity / failOn defaults if the CLI didn't override.
  if (projectConfig?.severity && opts.severity === undefined)
    cfg.severityThreshold = projectConfig.severity;
  if (projectConfig?.failOn && opts.failOn === undefined)
    cfg.failOn = projectConfig.failOn;
  if (projectConfig?.llm?.enabled === false && opts.llm === undefined)
    cfg.llm.provider = "none";

  // Load custom detectors from config.
  const customDetectors: Detector[] = projectConfig?.customDetectors
    ? await loadCustomDetectors(diff.repoRoot, projectConfig.customDetectors)
    : [];

  if (diff.files.length === 0) {
    if (cfg.output === "json") {
      process.stdout.write(formatJson([]) + "\n");
    } else if (cfg.output === "markdown") {
      process.stdout.write(formatMarkdown([], { showRationale: false }) + "\n");
    } else if (cfg.output === "sarif") {
      process.stdout.write(formatSarif([], { toolVersion: VERSION }) + "\n");
    } else {
      process.stdout.write("agent-review: no changes to review.\n");
    }
    return;
  }

  const project = collectProjectInfo(diff.repoRoot);

  let findings = await runDetectors({
    diff,
    project,
    detectorAllowlist: cfg.detectorAllowlist,
    detectorDenylist: cfg.detectorDenylist,
    llmEnabled: cfg.llm.provider !== "none",
    llmConfig: cfg.llm,
    config: projectConfig,
    customDetectors,
    noCache: opts.cache === false,
    toolVersion: VERSION,
  });

  // Baseline filtering: hide findings already fingerprinted in the baseline.
  const baselinePath =
    opts.baselineFile ??
    projectConfig?.baselineFile ??
    defaultBaselinePath(diff.repoRoot);
  if (opts.baseline && !opts.baselineUpdate) {
    const baseline = loadBaseline(baselinePath);
    if (baseline) {
      const filtered = filterAgainstBaseline(findings, baseline);
      findings = filtered.newFindings;
    } else if (cfg.output === "terminal") {
      process.stderr.write(
        `agent-review: baseline file ${baselinePath} not found; reporting all findings.\n` +
          `Run \`agent-review baseline init\` to create one.\n`
      );
    }
  }

  findings = filterBySeverity(findings, cfg.severityThreshold);

  if (cfg.applySafe) {
    const result = applySafeFixes(diff.repoRoot, findings);
    if (cfg.output === "terminal") {
      process.stdout.write(
        `agent-review: applied ${result.applied.length} safe fixes across ${result.files.length} files.\n`
      );
    }
    findings = result.skipped;
  }

  let out: string;
  if (cfg.output === "json") {
    out = formatJson(findings);
  } else if (cfg.output === "markdown") {
    out = formatMarkdown(findings, { showRationale: opts.rationale ?? true });
  } else if (cfg.output === "sarif") {
    out = formatSarif(findings, { toolVersion: VERSION });
  } else if (cfg.output === "github") {
    out = formatGithubAnnotations(findings);
  } else if (cfg.output === "junit") {
    out = formatJunit(findings);
  } else if (cfg.output === "html") {
    out = formatHtml(findings);
  } else {
    out = formatTerminal(findings, {
      noColor: cfg.noColor,
      showRationale: opts.rationale ?? true,
    });
  }
  process.stdout.write(out + "\n");

  if (cfg.output !== "json" && cfg.llm.provider === "none" && opts.llm === undefined) {
    process.stderr.write(
      "agent-review: static analysis only. Set ANTHROPIC_API_KEY (or OLLAMA_BASE_URL) and pass --llm to enable LLM checks.\n"
    );
  }

  process.exit(exitCode(cfg.failOn, findings));
}

function listDetectors(): void {
  for (const t of TAXONOMY) {
    process.stdout.write(
      `${t.id}\t${t.severity.padEnd(8)}\t${t.detectionType.padEnd(7)}\t${t.title}\n`
    );
  }
}

function skillInstall(): void {
  const target = join(homedir(), ".claude", "skills", "agent-review");
  const source = resolve(__dirname, "..", "skill");
  const altSource = resolve(__dirname, "..", "..", "src", "skill");
  const src = existsSync(source) ? source : altSource;
  if (!existsSync(src)) {
    process.stderr.write(`agent-review: cannot find skill template at ${src}.\n`);
    process.exit(1);
  }
  mkdirSync(target, { recursive: true });
  cpSync(src, target, { recursive: true });
  process.stdout.write(`Installed agent-review skill to ${target}\n`);
}

function skillUninstall(): void {
  const target = join(homedir(), ".claude", "skills", "agent-review");
  if (!existsSync(target)) {
    process.stdout.write("agent-review skill is not installed.\n");
    return;
  }
  rmSync(target, { recursive: true, force: true });
  process.stdout.write(`Removed ${target}\n`);
}

const program = new Command();
program
  .name("agent-review")
  .description(
    "Catch the 35 specific bugs AI coding agents commit when they write or modify code."
  )
  .version(VERSION);

program
  .command("review", { isDefault: true })
  .description("Review the current git diff and report agent-introduced issues.")
  .option("--staged", "Review staged changes (default)")
  .option("--last-commit", "Review HEAD~1..HEAD")
  .option("--branch [base]", "Review base..HEAD (default base = main)")
  .option("--working-tree", "Review HEAD..working tree")
  .option("--files <files...>", "Restrict review to these paths")
  .option("--apply-safe", "Apply auto-safe fixes")
  .option("--json", "Emit JSON output")
  .option("--markdown", "Emit Markdown output")
  .option("--sarif", "Emit SARIF 2.1.0 output (for GitHub Code Scanning)")
  .option("--github", "Emit GitHub Actions annotations (auto-enabled in CI)")
  .option("--junit", "Emit JUnit XML (for Jenkins, Buildkite, GitLab, CircleCI)")
  .option("--html", "Emit a standalone HTML report")
  .option("--severity <level>", "Minimum severity to report", "info")
  .option("--allow <ids>", "Comma-separated detector IDs to allowlist")
  .option("--deny <ids>", "Comma-separated detector IDs to skip")
  .option("--llm", "Enable LLM-augmented detectors (AR026-AR035)")
  .option("--no-llm", "Disable LLM detectors even if a key is set")
  .option("--model <name>", "LLM model name")
  .option("--ollama-url <url>", "Ollama base URL")
  .option("--openai-url <url>", "OpenAI-compatible base URL (e.g. Groq, Together)")
  .option("--provider <name>", "LLM provider: anthropic | openai | ollama | none")
  .option("--no-cache", "Skip the persistent finding cache")
  .option("--timeout <seconds>", "LLM timeout in seconds")
  .option("--fail-on <level>", "Exit non-zero on findings: never|any|high|critical", "never")
  .option("--baseline", "Use the baseline file to suppress pre-existing findings")
  .option("--baseline-update", "Refresh the baseline file with current findings")
  .option("--baseline-file <path>", "Override the baseline file location")
  .option("--no-color", "Disable colored output")
  .option("--rationale", "Show LLM rationale in output")
  .option("--verbose", "Verbose logging")
  .option("--quiet", "Errors only")
  .option("--cwd <dir>", "Operate in <dir> instead of process.cwd()")
  .option("--print-diff", "Dump the parsed diff and exit")
  .action(async (opts) => {
    await reviewCommand(opts);
  });

const baseline = program.command("baseline").description("Manage the agent-review baseline file");
baseline
  .command("init")
  .description("Run agent-review and save the current findings as the baseline.")
  .option("--branch [base]", "Compute baseline from base..HEAD (default base = main)")
  .option("--file <path>", "Path to write the baseline JSON")
  .option("--cwd <dir>", "Operate in <dir>")
  .action(async (opts) => {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const repoRoot = findRepoRoot(cwd);
    const projectConfig = loadConfigFile(repoRoot);
    const diff = collectDiff({
      cwd: repoRoot,
      mode: opts.branch ? "branch" : "working-tree",
      baseRef: typeof opts.branch === "string" ? opts.branch : "main",
    });
    const project = collectProjectInfo(repoRoot);
    const customDetectors: Detector[] = projectConfig?.customDetectors
      ? await loadCustomDetectors(repoRoot, projectConfig.customDetectors)
      : [];
    const findings = await runDetectors({
      diff,
      project,
      llmEnabled: false,
      config: projectConfig,
      customDetectors,
    });
    const path = opts.file
      ? resolve(repoRoot, opts.file)
      : projectConfig?.baselineFile
        ? resolve(repoRoot, projectConfig.baselineFile)
        : defaultBaselinePath(repoRoot);
    const saved = saveBaseline(path, findings);
    process.stdout.write(
      `Wrote baseline to ${path} with ${saved.entries.length} entries.\n`
    );
  });

const hook = program.command("hook").description("Install a git pre-commit hook that runs agent-review");
hook
  .command("install")
  .description("Install .git/hooks/pre-commit to run `agent-review --staged --fail-on high`")
  .option("--cwd <dir>", "Operate in <dir>")
  .action((opts) => {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const repoRoot = findRepoRoot(cwd);
    const path = join(repoRoot, ".git", "hooks", "pre-commit");
    const script = `#!/usr/bin/env bash
# Installed by \`agent-review hook install\`.
# Runs the static detectors on staged changes; blocks commit on high/critical findings.
set -e
if ! command -v npx >/dev/null 2>&1; then
  echo "agent-review hook: npx not found; skipping" >&2
  exit 0
fi
npx --yes agent-review --staged --fail-on high
`;
    writeFileSync(path, script);
    chmodSync(path, 0o755);
    process.stdout.write(`Installed pre-commit hook at ${path}\n`);
  });
hook
  .command("uninstall")
  .description("Remove .git/hooks/pre-commit")
  .option("--cwd <dir>", "Operate in <dir>")
  .action((opts) => {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const repoRoot = findRepoRoot(cwd);
    const path = join(repoRoot, ".git", "hooks", "pre-commit");
    if (existsSync(path)) {
      rmSync(path);
      process.stdout.write(`Removed ${path}\n`);
    } else {
      process.stdout.write("No pre-commit hook installed.\n");
    }
  });

program
  .command("list")
  .description("List all detector IDs and their titles")
  .action(() => listDetectors());

program
  .command("explain <id>")
  .description("Print the taxonomy entry for a detector ID (e.g. agent-review explain AR017)")
  .action((id: string) => {
    const entry = TAXONOMY.find((t) => t.id === id.toUpperCase());
    if (!entry) {
      process.stderr.write(`Unknown detector ID: ${id}\nRun \`agent-review list\` to see all IDs.\n`);
      process.exit(1);
    }
    const lines = [
      `${entry.id}: ${entry.title}`,
      "",
      `category:        ${entry.category}`,
      `severity:        ${entry.severity}`,
      `detection type:  ${entry.detectionType}`,
      `auto-fixable:    ${entry.fixKind}`,
      "",
      "What it detects:",
      `  ${entry.description}`,
      "",
      "Why agents do this:",
      `  ${entry.whyAgentsDoThis}`,
      "",
      "Example (before):",
      ...entry.example.before.split("\n").map((l) => "  " + l),
      "",
      "Example (after):",
      ...entry.example.after.split("\n").map((l) => "  " + l),
      "",
      `Reference: https://github.com/agent-review/agent-review/blob/main/TAXONOMY.md#${entry.id.toLowerCase()}`,
    ];
    process.stdout.write(lines.join("\n") + "\n");
  });

program
  .command("init")
  .description("Bootstrap agent-review in this repo: write config, install hook, install skill")
  .option("--skip-hook", "Don't install the git pre-commit hook")
  .option("--skip-skill", "Don't install the Claude Code skill")
  .option("--skip-config", "Don't write a starter .agent-review.json")
  .option("--cwd <dir>", "Operate in <dir>")
  .action((opts) => {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const repoRoot = findRepoRoot(cwd);
    const summary: string[] = [];

    if (!opts.skipConfig) {
      const target = join(repoRoot, ".agent-review.json");
      if (existsSync(target)) {
        summary.push(`config:  exists at ${target} (skipped)`);
      } else {
        const example = JSON.stringify(
          {
            $schema:
              "https://raw.githubusercontent.com/agent-review/agent-review/main/docs/config.schema.json",
            exclude: ["dist/**", "build/**", "vendor/**"],
            severity: "info",
            failOn: "high",
            rules: {},
            llm: { enabled: false, provider: "anthropic" },
          },
          null,
          2
        );
        writeFileSync(target, example + "\n");
        summary.push(`config:  wrote ${target}`);
      }
    }

    if (!opts.skipHook) {
      const hookPath = join(repoRoot, ".git", "hooks", "pre-commit");
      const script = `#!/usr/bin/env bash
# Installed by \`agent-review init\`.
set -e
if ! command -v npx >/dev/null 2>&1; then exit 0; fi
npx --yes agent-review --staged --fail-on high
`;
      writeFileSync(hookPath, script);
      chmodSync(hookPath, 0o755);
      summary.push(`hook:    wrote ${hookPath}`);
    }

    if (!opts.skipSkill) {
      const skillTarget = join(homedir(), ".claude", "skills", "agent-review");
      const source = resolve(__dirname, "..", "skill");
      const altSource = resolve(__dirname, "..", "..", "src", "skill");
      const src = existsSync(source) ? source : altSource;
      if (existsSync(src)) {
        mkdirSync(skillTarget, { recursive: true });
        cpSync(src, skillTarget, { recursive: true });
        summary.push(`skill:   installed to ${skillTarget}`);
      } else {
        summary.push(`skill:   skipped (template not found)`);
      }
    }

    process.stdout.write(`agent-review initialized.\n\n${summary.join("\n")}\n\nNext: edit .agent-review.json to taste, then run \`agent-review --staged\`.\n`);
  });

program
  .command("stats")
  .description("Show summary statistics for the latest review (JSON-friendly)")
  .option("--branch [base]", "Stats for base..HEAD")
  .option("--cwd <dir>", "Operate in <dir>")
  .action(async (opts) => {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const repoRoot = findRepoRoot(cwd);
    const projectConfig = loadConfigFile(repoRoot);
    const diff = collectDiff({
      cwd: repoRoot,
      mode: opts.branch ? "branch" : "working-tree",
      baseRef: typeof opts.branch === "string" ? opts.branch : "main",
    });
    const project = collectProjectInfo(repoRoot);
    const findings = await runDetectors({
      diff,
      project,
      llmEnabled: false,
      config: projectConfig,
    });
    const summary: Record<string, any> = {
      total: findings.length,
      bySeverity: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byDetector: {} as Record<string, number>,
      byFile: {} as Record<string, number>,
    };
    for (const f of findings) {
      summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] ?? 0) + 1;
      summary.byCategory[f.category] = (summary.byCategory[f.category] ?? 0) + 1;
      summary.byDetector[f.detectorId] = (summary.byDetector[f.detectorId] ?? 0) + 1;
      summary.byFile[f.file] = (summary.byFile[f.file] ?? 0) + 1;
    }
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  });

program
  .command("watch")
  .description("Re-run review when watched files change")
  .option("--cwd <dir>", "Operate in <dir>")
  .option("--llm", "Enable LLM detectors on each run")
  .action(async (opts) => {
    const { spawn } = await import("node:child_process");
    const { watch } = await import("node:fs");
    const cwd = resolve(opts.cwd ?? process.cwd());
    let running = false;
    let pending = false;
    function trigger() {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      const args = ["--working-tree", "--no-color"];
      if (opts.llm) args.push("--llm");
      const child = spawn(process.execPath, [process.argv[1] ?? "", ...args], {
        stdio: "inherit",
        cwd,
      });
      child.on("exit", () => {
        running = false;
        if (pending) {
          pending = false;
          setTimeout(trigger, 100);
        }
      });
    }
    process.stdout.write(`agent-review: watching ${cwd} for changes...\n`);
    let timer: NodeJS.Timeout | null = null;
    watch(cwd, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      if (filename.includes("node_modules") || filename.includes(".git")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(trigger, 250);
    });
    trigger();
  });

const skill = program.command("skill").description("Manage the Claude Code skill");
skill
  .command("install")
  .description("Install ~/.claude/skills/agent-review")
  .action(() => skillInstall());
skill
  .command("uninstall")
  .description("Remove ~/.claude/skills/agent-review")
  .action(() => skillUninstall());

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`agent-review: ${err?.message ?? err}\n`);
  process.exit(1);
});
