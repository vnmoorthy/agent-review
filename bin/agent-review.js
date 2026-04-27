#!/usr/bin/env node
// Entry point for the agent-review CLI.
// Loads the compiled bundle when present, otherwise falls back to running
// the TS source through tsx (useful during local development).

const path = require("path");
const fs = require("fs");

const distPath = path.join(__dirname, "..", "dist", "cli.js");

async function run() {
  if (fs.existsSync(distPath)) {
    require(distPath);
    return;
  }

  const srcPath = path.join(__dirname, "..", "src", "cli", "index.ts");
  if (!fs.existsSync(srcPath)) {
    console.error("agent-review: build artifacts missing. Run `pnpm build` first.");
    process.exit(1);
  }

  try {
    require("tsx/cjs");
    require(srcPath);
  } catch (err) {
    console.error(
      "agent-review: cannot run TypeScript source directly. Run `pnpm build` or `npm run build`."
    );
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
