# Quick Start: Multi-Agent Orchestration

Get the orchestration layer running in **2 minutes**.

## 30-Second Setup

```bash
# 1. Install git hook
cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# 2. Start orchestration services
bash .claude/start-all.sh

# 3. Make a change and test
git add src/components/ui/button.tsx
git commit -m "test: orchestration"

# Watch the flow!
tail -f .claude/activity/*.log
```

Done. ✅

## What Just Happened?

**You made a commit** →
→ **Git hook triggered Codex** (formatting) →
→ **File watcher triggered Antigravity** (tests) →
→ **Orchestrator coordinated flow** →
→ **DevPit waited for approval** ✅

## 5-Minute Tour

### Terminal 1: Start Everything

```bash
bash .claude/start-all.sh
```

Output:
```
🚀 Starting Triangle Services OS - Multi-Agent Orchestration
📋 Checking prerequisites...
🔧 Setting up git pre-commit hook...
✅ Pre-commit hook installed
🎯 Starting Orchestrator...
✅ Orchestrator started (PID: 12345)
👁️  Starting File Watcher...
✅ File Watcher started (PID: 12346)

✅ Multi-Agent Orchestration Ready
```

Services now running in background.

### Terminal 2: Watch Activity Logs

```bash
tail -f .claude/activity/*.log
```

You'll see real-time logs as agents run:
```
[2026-04-26T10:30:00Z] 🔄 Processing codex-format for codex
[2026-04-26T10:30:01Z] ✅ Codex: Prettier formatting completed
[2026-04-26T10:30:01Z] ✅ Codex: ESLint fixes applied
[2026-04-26T10:30:02Z] 🔄 Processing antigravity-test for antigravity
[2026-04-26T10:30:05Z] ✅ Antigravity: TypeScript check passed
[2026-04-26T10:30:06Z] ✅ Antigravity: ESLint passed
```

### Terminal 3: Make a Change

Edit a file and commit:

```bash
# Edit something
nano src/components/ui/button.tsx

# Stage and commit
git add src/components/ui/button.tsx
git commit -m "feat: add cool feature"
```

Watch Terminal 2 light up! ⚡

## How Agents Work Together

```
You (Claude Code)
    ↓
    commit to git
    ↓
Pre-commit Hook
    ↓
Codex (auto-format)
    ↓
Codex formats code
    ↓
File changes detected
    ↓
Antigravity (test)
    ↓
Antigravity runs:
  • TypeScript check
  • ESLint
  • Tests
    ↓
Orchestrator coordinates
    ↓
DevPit awaits approval
```

## Key Directories

```
.claude/
├── ORCHESTRATION.md          ← Full documentation
├── QUICK_START.md            ← You are here
├── launch.json               ← Integration config
├── start-all.sh              ← Start all services
│
├── orchestration/
│   ├── config.json           ← Agent definitions
│   └── task-queue.json       ← Inter-agent messages
│
├── workflows/
│   └── devpit-config.yaml    ← Workflow definitions
│
├── hooks/
│   └── pre-commit.sh         ← Git pre-commit hook
│
├── watchers/
│   └── file-watcher.js       ← File change watcher
│
├── coordinator/
│   └── orchestrator.js       ← Central hub
│
└── activity/
    ├── codex.log             ← Codex activity
    ├── antigravity.log       ← Antigravity activity
    ├── devpit.log            ← DevPit activity
    └── orchestrator.log      ← Orchestrator logs
```

## Common Commands

### Start/Stop Services

```bash
# Start all
bash .claude/start-all.sh

# Stop orchestrator
pkill -f "node .claude/coordinator/orchestrator.js"

# Stop file watcher
pkill -f "node .claude/watchers/file-watcher.js"

# Stop both
pkill -f "node .claude" 2>/dev/null || true
```

### Monitor Workflow

```bash
# Real-time logs
tail -f .claude/activity/*.log

# Orchestrator logs only
tail -f .claude/activity/orchestrator.log

# Task queue status
cat .claude/orchestration/task-queue.json | jq

# Agent status
grep "status" .claude/activity/*.log | tail -5
```

### Manual Triggers

Edit `.claude/orchestration/task-queue.json`:

```json
{
  "action": "codex-format",
  "status": "pending",
  "files": ["src/components/module/feature.tsx"]
}
```

Orchestrator will process it immediately.

## Troubleshooting

### "Pre-commit hook not running"

Ensure it's executable:
```bash
chmod +x .git/hooks/pre-commit
```

Test manually:
```bash
bash .git/hooks/pre-commit
```

### "Services not starting"

Check logs:
```bash
cat .claude/activity/orchestrator.log
cat .claude/activity/watcher.log
```

### "Tests failing"

Run manually to debug:
```bash
npx tsc --noEmit
npx eslint src/
npm test
```

### "File watcher not detecting changes"

Restart it:
```bash
pkill -f file-watcher
node .claude/watchers/file-watcher.js &
```

## Next: Full Documentation

Read `.claude/ORCHESTRATION.md` for:
- Complete architecture overview
- All workflow types
- Configuration details
- Customization guide
- Advanced usage

## Testing the Flow

Here's a minimal test commit that exercises the whole flow:

```bash
# 1. Create or edit a simple file
echo "// test comment" >> src/lib/utils.ts

# 2. Stage it
git add src/lib/utils.ts

# 3. Commit (this triggers pre-commit hook)
git commit -m "test: orchestration flow test"

# 4. Watch terminal with logs
tail -f .claude/activity/*.log

# Expected output:
# [pre-commit] Triggering Codex...
# [codex] Prettier formatting completed
# [file-watcher] Changed: src/lib/utils.ts
# [antigravity] Triggered by file change
# [antigravity] TypeScript check passed
# [devpit] Awaiting approval
```

All 4 agents in action! 🚀

## Status

✅ **Orchestration layer installed and ready**

Agents can now:
- 🤖 Work together automatically
- 🔗 Trigger each other's workflows
- 📊 Log and monitor progress
- 🎯 Coordinate complex tasks
- ✅ Validate before merge

**Next**: Use it for real development tasks!

---

Questions? See `.claude/ORCHESTRATION.md` for full docs.
