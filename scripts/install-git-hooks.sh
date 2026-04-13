#!/bin/sh
#
# install-git-hooks.sh — wire up the repo's pre-commit hook.
#
# Run this once after cloning the repo:
#   sh scripts/install-git-hooks.sh
#
# This sets git's core.hooksPath to .githooks/, which is committed to the
# repo. From then on, every commit runs the checks in .githooks/pre-commit.

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "✓ git core.hooksPath set to .githooks"
echo "✓ pre-commit hook active: $(git config core.hooksPath)/pre-commit"
echo ""
echo "Test it:"
echo "  echo 'window.addEventListener(\"x\", ()=>{});' > /tmp/bad.ts"
echo "  node packages/app/scripts/lint-rn-safety.mjs /tmp/bad.ts"
