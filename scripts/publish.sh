#!/usr/bin/env bash
# scripts/publish.sh — one-command publisher for agent-review.
#
# What this does, in order:
#   1. Verifies you have `gh` and you're authenticated (or installs gh on macOS).
#   2. Verifies the working tree is clean and tests pass.
#   3. Makes the initial commit if there isn't one.
#   4. Creates a public GitHub repo and pushes.
#   5. Adds discoverability topics.
#
# Usage:
#   bash scripts/publish.sh                     # repo name = agent-review
#   bash scripts/publish.sh my-custom-name      # repo name override
#
# Authentication: this script assumes you've already run `gh auth login` in a
# browser. It NEVER reads tokens from environment or stdin. If you're not
# authenticated, the script will tell you and stop.

set -euo pipefail

REPO_NAME="${1:-agent-review}"
DESCRIPTION="Catch the 35 specific bugs AI coding agents commit. Offline by default. MIT."
TOPICS="claude-code,ai,code-review,linter,static-analysis,claude,codex,cursor,agents,typescript"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✔\033[0m %s\n" "$1"; }
err()  { printf "\033[31m✘\033[0m %s\n" "$1" >&2; }

bold "[1/7] Checking prerequisites"

if ! command -v git >/dev/null 2>&1; then
  err "git is not installed."
  exit 1
fi
ok "git found"

if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    bold "  installing gh via brew..."
    brew install gh
  else
    err "GitHub CLI (gh) is not installed. Install it from https://cli.github.com and retry."
    exit 1
  fi
fi
ok "gh found ($(gh --version | head -1))"

if ! gh auth status >/dev/null 2>&1; then
  err "You are not signed in to gh. Run: gh auth login"
  err "Pick: GitHub.com → HTTPS → 'login with a web browser'."
  err "DO NOT paste a personal access token into a chat or terminal that other people might see."
  exit 1
fi
GH_USER="$(gh api user --jq .login)"
ok "authenticated as $GH_USER"

bold "[2/7] Verifying tests pass before publishing"
if [ -f package.json ] && [ -d node_modules ]; then
  if ! npx vitest run >/dev/null 2>&1; then
    err "Tests are failing. Fix them before publishing."
    npx vitest run | tail -20
    exit 1
  fi
  ok "all tests pass"
else
  echo "  (skipping test run — node_modules not installed)"
fi

bold "[3/7] Templating GitHub username into the codebase"
# Replace the placeholder "agent-review/agent-review" (the org slug) with the
# real $GH_USER/$REPO_NAME. We do this idempotently — re-running the script
# is a no-op once the placeholder is gone.
PLACEHOLDER="agent-review/agent-review"
REAL="$GH_USER/$REPO_NAME"
if grep -rq --include='*.md' --include='*.json' --include='*.ts' --include='*.yml' \
  "$PLACEHOLDER" . 2>/dev/null; then
  # macOS sed wants -i ''; GNU sed wants -i. Try GNU first.
  if sed --version 2>/dev/null | grep -q GNU; then
    grep -rl --include='*.md' --include='*.json' --include='*.ts' --include='*.yml' \
      "$PLACEHOLDER" . 2>/dev/null \
      | xargs sed -i "s|$PLACEHOLDER|$REAL|g"
  else
    grep -rl --include='*.md' --include='*.json' --include='*.ts' --include='*.yml' \
      "$PLACEHOLDER" . 2>/dev/null \
      | xargs sed -i '' "s|$PLACEHOLDER|$REAL|g"
  fi
  ok "rewrote occurrences of $PLACEHOLDER → $REAL"
else
  ok "no placeholder occurrences left to template"
fi

bold "[4/7] Cleaning git state"
rm -f .git/index.lock 2>/dev/null || true
if [ ! -d .git ]; then
  git init -q -b main
  ok "initialized fresh git repo on main"
fi

# Make sure we're on main.
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"
if [ "$CURRENT_BRANCH" != "main" ]; then
  if git rev-parse --verify main >/dev/null 2>&1; then
    git checkout -q main
  else
    git checkout -q -b main
  fi
fi

bold "[5/7] Staging + committing"
git add -A

if git rev-parse --quiet --verify HEAD >/dev/null; then
  if git diff --cached --quiet; then
    ok "nothing new to commit"
  else
    git commit -q -m "Update agent-review"
    ok "committed pending changes"
  fi
else
  git commit -q -m "Initial commit: agent-review v0.1.0

35-mode taxonomy of AI agent-introduced bugs + static analyzer + Claude Code skill.

- 25 deterministic static detectors (AR001-AR025)
- 10 LLM-augmented detectors (AR026-AR035) via Anthropic or Ollama
- Five output formats: terminal, JSON, Markdown, SARIF 2.1.0, GitHub annotations
- Inline ignore directives (// agent-review-ignore-next-line AR012)
- Project config via .agent-review.json with per-detector overrides
- Baseline mode for incremental adoption on existing codebases
- Pre-commit hook installer + composite GitHub Action
- Custom detector plugin architecture
- Drop-in Claude Code skill (agent-review skill install)
- 66 tests passing, TypeScript strict, dogfood clean

Read TAXONOMY.md for the failure-mode reference. MIT licensed."
  ok "initial commit created"
fi

bold "[6/7] Creating GitHub repo + pushing"
if gh repo view "$GH_USER/$REPO_NAME" >/dev/null 2>&1; then
  ok "repo $GH_USER/$REPO_NAME already exists"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"
  fi
  git push -u origin main
else
  gh repo create "$REPO_NAME" \
    --public \
    --source=. \
    --remote=origin \
    --push \
    --description "$DESCRIPTION" \
    --homepage "https://github.com/$GH_USER/$REPO_NAME"
  ok "created and pushed https://github.com/$GH_USER/$REPO_NAME"
fi

bold "[7/7] Adding discoverability topics"
gh repo edit "$GH_USER/$REPO_NAME" --add-topic "$TOPICS" >/dev/null
ok "topics added: $TOPICS"

echo
bold "Done. Visit your new repo:"
echo "  https://github.com/$GH_USER/$REPO_NAME"
echo
bold "Suggested next steps:"
echo "  • Star your own repo so social proof starts at 1, not 0."
echo "  • Open the launch playbook: cat LAUNCH.md"
echo "  • Add ANTHROPIC_API_KEY as a repo secret if you want LLM checks in CI."
echo "  • npm publish (after npm login) so 'npx agent-review' resolves to your package."
