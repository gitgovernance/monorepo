#!/usr/bin/env bash
# Prepare a monorepo worktree to be worked in.
#
# The monorepo is the host. This is the file the Orca worktree hook calls (see
# orca.yaml at the repo root), and it does two things, in this order:
#
#   1. The monorepo's OWN material: install, build @gitgov/core and the five
#      agents. Core goes first because everything imports it; the agents go
#      before the CLI because the CLI bundle imports them statically
#      (packages/cli/src/services/builtin-agents.ts, EARS-C18).
#
#   2. The private GUEST, under packages/private. It is a nested clone and
#      gitignored — it cannot be a submodule (monorepo 75c26ee: the public repo
#      would carry a pointer into a private one) — and it links back here
#      through @gitgov/core -> link:../core, so it MUST live at that exact path.
#      Preparing it is private's own business, so this file clones it and hands
#      over to its script.
#
# Idempotent: running it twice changes nothing. Fail-closed: any failed step
# stops the whole thing, because a worktree half-prepared starts on defaults and
# the failure is silent.
#
# Usage:
#   scripts/worktree-setup.sh [<worktree-path>]
# <worktree-path> defaults to the checkout this file lives in. Orca passes
# $ORCA_WORKTREE_PATH, so the hook and a human use the same entry point.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd "$HERE/.." && pwd)}"
PRIVATE="$ROOT/packages/private"
PNPM="${PNPM:-pnpm}"
PRIVATE_REPO="git@github.com:gitgovernance/private.git"

pass() { printf "  \033[32mOK  \033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; }
head() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# Run a step, keeping its output out of the way and showing it only if it fails.
# The label is printed BEFORE the step runs: the clone below takes minutes, and a
# silent screen reads as a hung one.
run() {
  local label="$1"; shift
  local log; log=$(mktemp)
  printf "  .... %s\n" "$label"
  if ( cd "$ROOT" && "$@" ) >"$log" 2>&1; then
    printf "  \033[32mOK  \033[0m %s\n" "$label"; rm -f "$log"; return 0
  fi
  printf "  \033[31mFAIL\033[0m %s\n" "$label"
  tail -12 "$log" | sed 's/^/        /'
  rm -f "$log"; return 1
}

head "1. private (guest)"
if [ -d "$PRIVATE/.git" ]; then
  pass "already cloned at packages/private"
else
  run "clone gitgovernance/private" git clone "$PRIVATE_REPO" "$PRIVATE" || exit 1
fi

head "2. Dependencies (monorepo)"
run "pnpm install" "$PNPM" install --frozen-lockfile || exit 1

head "3. Builds"
run "@gitgov/core"     "$PNPM" --filter @gitgov/core build             || exit 1
run "the 5 agents"     "$PNPM" -r --filter './packages/agents/*' build  || exit 1

head "4. private setup"
if [ -x "$PRIVATE/scripts/worktree-setup.sh" ]; then
  "$PRIVATE/scripts/worktree-setup.sh" "$PRIVATE" || exit 1
else
  fail "missing $PRIVATE/scripts/worktree-setup.sh"
  exit 1
fi

head "monorepo worktree ready"
echo "  ${ROOT}"
echo
echo "  start the dev stack:  gitgov-dev up ${ROOT}"
echo "  check it:             gitgov-dev status"
echo
echo "  (the CLI is not built here: it is not needed for development)"
