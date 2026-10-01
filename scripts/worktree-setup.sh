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
#   2. The private GUEST, under packages/private. It is a nested checkout and
#      gitignored — it cannot be a submodule (monorepo 75c26ee: the public repo
#      would carry a pointer into a private one) — and it links back here
#      through @gitgov/core -> link:../core, so it MUST live at that exact path.
#      Preparing it is private's own business, so this file puts it there and
#      hands over to its script.
#
#      It is a `git worktree` of the machine's private base clone, NOT a fresh
#      clone: the two share their object store, so a new monorepo worktree costs
#      seconds instead of the minutes a full clone over the network takes. Each
#      worktree still gets its own checkout and its own branch, which is what
#      makes it possible to open a pull request against `private` from inside a
#      monorepo worktree without disturbing any other one.
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
# The one private checkout the others are worktrees of. It is not created here:
# without it there is nothing to share objects with, and silently cloning one
# would hide the mistake behind two minutes of network.
PRIVATE_BASE="${GITGOV_PRIVATE_BASE:-$HOME/projects/github.com/gitgovernance/private}"

pass() { printf "  \033[32mOK  \033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; }
head() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# Run a step, keeping its output out of the way and showing it only if it fails.
# The label is printed BEFORE the step runs: the fetch below can take a while on
# a slow link, and a silent screen reads as a hung one.
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
if [ -e "$PRIVATE/.git" ]; then
  pass "already present at packages/private"
else
  if [ ! -d "$PRIVATE_BASE/.git" ]; then
    fail "no private base clone at $PRIVATE_BASE"
    echo "        gitgovernance/private is a private repo: preparing a worktree needs" >&2
    echo "        access to it. Create the base clone once, then run this again:" >&2
    echo "          git clone $PRIVATE_REPO $PRIVATE_BASE" >&2
    echo "        (or point GITGOV_PRIVATE_BASE at an existing clone)" >&2
    exit 1
  fi
  # Prune first: a monorepo worktree that was deleted leaves its admin entry
  # behind in the base clone, and the list would grow forever otherwise.
  run "prune stale worktrees"  git -C "$PRIVATE_BASE" worktree prune || exit 1
  run "fetch $PRIVATE_BASE"    git -C "$PRIVATE_BASE" fetch --prune origin || exit 1
  # --detach, not a branch: the base clone already has `main` checked out, and
  # git refuses to hand the same branch to two worktrees at once. Whoever
  # changes something here creates its branch first — the habit we want anyway.
  run "worktree at packages/private" \
    git -C "$PRIVATE_BASE" worktree add --detach "$PRIVATE" origin/main || exit 1
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
echo "  private is a detached worktree of:"
echo "    $PRIVATE_BASE"
echo "  to change something there:  cd $PRIVATE && git switch -c <branch>"
echo
echo "  (the CLI is not built here: it is not needed for development)"
