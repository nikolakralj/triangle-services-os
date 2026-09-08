#!/bin/bash
# Pre-commit: format and fix what a deterministic tool can fix. No model call.
#
# This used to write a "codex-format" job into .claude/orchestration/task-queue.json
# for a model to pick up and tidy the staged files. Two things were wrong with
# that. Formatting is a solved problem that eslint does perfectly for nothing,
# and asking a language model to do it is paying for a worse answer. And it
# never actually ran: the heredoc that wrote the job needs jq, jq is not
# installed here, so every commit printed "Codex trigger queued" and queued
# nothing — while leaving task-queue.json dirty in the working tree.
#
# Install: cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)
if [ -z "$STAGED" ]; then
  exit 0
fi

echo "[pre-commit] eslint --fix on $(echo "$STAGED" | wc -l | tr -d ' ') staged file(s)"
# shellcheck disable=SC2086
npx eslint --fix $STAGED || {
  echo "[pre-commit] eslint found problems it cannot fix. Commit anyway; fix them next."
}
# Re-stage anything eslint rewrote, so the fix is in the commit rather than
# left behind in the working tree.
echo "$STAGED" | xargs -r git add
exit 0
