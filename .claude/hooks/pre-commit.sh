#!/bin/bash
# Pre-commit hook: Auto-trigger Codex for formatting before commit
# This hook runs Codex auto-polish on staged changes
# Install: cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

echo "🔄 [Pre-commit] Triggering Codex auto-polish..."

# Load orchestration config
CONFIG_FILE=".claude/orchestration/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Orchestration config not found at $CONFIG_FILE"
    exit 1
fi

# Check if Codex is enabled
CODEX_ENABLED=$(grep -q '"enabled": true' "$CONFIG_FILE" && echo "true" || echo "false")
if [ "$CODEX_ENABLED" != "true" ]; then
    echo "⏭️  Codex is disabled, skipping"
    exit 0
fi

# Get list of staged TypeScript/TSX files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -z "$STAGED_FILES" ]; then
    echo "ℹ️  No TypeScript/JavaScript files staged, skipping Codex"
    exit 0
fi

# Update task queue to signal Codex
TASK_QUEUE=".claude/orchestration/task-queue.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create a simple notification that Codex should run
cat > "$TASK_QUEUE.tmp" <<EOF
{
  "last_trigger": "pre-commit",
  "triggered_at": "$TIMESTAMP",
  "action": "codex-format",
  "files": $(echo "$STAGED_FILES" | jq -R -s -c 'split("\n")[:-1]'),
  "status": "pending"
}
EOF
mv "$TASK_QUEUE.tmp" "$TASK_QUEUE"

echo "✅ [Pre-commit] Codex trigger queued"
echo "   Files staged: $(echo "$STAGED_FILES" | wc -l)"
echo "   ⏳ Codex will format on next commit phase"

exit 0
