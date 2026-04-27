#!/usr/bin/env bash
# Install agent-review as a Claude Code skill in ~/.claude/skills/agent-review.

set -euo pipefail

TARGET="${HOME}/.claude/skills/agent-review"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "${TARGET}"
cp -r "${HERE}/." "${TARGET}/"

echo "Installed agent-review skill to ${TARGET}"
echo
echo "Usage from Claude Code: just edit code as usual; the skill will trigger when you're wrapping up."
