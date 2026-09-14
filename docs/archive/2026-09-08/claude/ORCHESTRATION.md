# Multi-Agent Orchestration Layer

Glue layer that connects **Claude Code**, **Codex**, **Antigravity**, and **DevPit** so they work together and trigger each other automatically.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Development Workflow                        │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
        v                                   v
  Feature Development              Bug Fix Workflow
    (5 stages)                      (4 stages)
        │                                   │
        └─────────────┬─────────────────────┘
                      │
        ┌─────────────v─────────────┐
        │   Task Queue (.json)      │
        │  & Notification System    │
        └────────────┬──────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    v                v                v
┌─────────┐    ┌─────────┐    ┌──────────┐
│ Codex   │    │Antigrav-│    │ DevPit   │
│(Format) │    │ity(Test)│    │ (Approve)│
└─────────┘    └─────────┘    └──────────┘
    │                │                │
    └────────────────┼────────────────┘
                     │
                ┌────v────┐
                │ Git     │
                │ & Repo  │
                └─────────┘
```

## How It Works

### 1. **Claude Code** (You / Main IDE Agent)
- Designs features
- Writes code
- Creates commits
- **Signals**: Commits to git → pre-commit hook triggers Codex

### 2. **Codex** (Auto-Polish)
- Triggered by pre-commit hook (`.claude/hooks/pre-commit.sh`)
- Auto-formats code (Prettier)
- Runs ESLint fixes
- **Signals**: Formatting complete → notifies Antigravity

### 3. **Antigravity** (Local Testing)
- Triggered by file watcher (`.claude/watchers/file-watcher.js`)
- Runs TypeScript type checking
- Runs ESLint validation
- Runs tests
- **Signals**: Test results → notifies DevPit

### 4. **DevPit** (Workflow Orchestration)
- Triggered by test completion
- Reviews changes
- Approves merges
- Makes deployment decisions
- **Signals**: Approval → ready for merge/deploy

## Setup

### Install Hook

```bash
cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

This triggers Codex formatting before every commit.

### Start File Watcher

```bash
node .claude/watchers/file-watcher.js &
```

Monitors `src/` and `supabase/migrations/` for changes, triggers Antigravity.

### Start Orchestrator

```bash
node .claude/coordinator/orchestrator.js &
```

Central hub that:
- Monitors task queue
- Routes signals between agents
- Logs activity
- Manages workflow state

### Optional: Start All

```bash
bash .claude/start-all.sh
```

## Workflows

### Feature Development (Default)

```
1. Design
   └─> Claude Code creates feature spec
       └─> Commit code
           └─> Codex formats
               └─> Antigravity tests
                   └─> DevPit reviews & approves
```

### Bug Fix (Faster)

```
1. Diagnosis
   └─> Claude Code identifies root cause
       └─> Fix implementation
           └─> Codex formats
               └─> Antigravity verifies
                   └─> DevPit approves merge
```

### Database Migration

```
1. Design (with approval)
   └─> Create & document migration
       └─> Antigravity tests locally
           └─> DevPit approves for staging
               └─> (Manual deploy to staging/prod)
```

## Task Queue

**Location**: `.claude/orchestration/task-queue.json`

Agents communicate via this JSON file:

```json
{
  "last_trigger": "pre-commit",
  "triggered_at": "2026-04-26T10:30:00Z",
  "action": "codex-format",
  "files": ["src/components/ui/button.tsx"],
  "status": "pending"
}
```

**Signals**:
- `codex-format`: Format code → Codex processes
- `antigravity-test`: Run tests → Antigravity processes
- `review-changes`: Review & approve → DevPit processes

## Configuration Files

| File | Purpose |
|------|---------|
| `.claude/orchestration/config.json` | Agent definitions & workflow stages |
| `.claude/orchestration/task-queue.json` | Inter-agent communication queue |
| `.claude/workflows/devpit-config.yaml` | DevPit workflow definitions |
| `.claude/hooks/pre-commit.sh` | Git pre-commit → Codex trigger |
| `.claude/watchers/file-watcher.js` | File changes → Antigravity trigger |
| `.claude/coordinator/orchestrator.js` | Central orchestration hub |

## Adding Agents

Read `.claude/ADDING_AGENTS.md` before introducing any new runtime agent.

Important:

- `config.json` and `devpit-config.yaml` are not enough by themselves
- new agents must be wired into `orchestrator.js`
- some producer must write a matching `action` into `task-queue.json`

## Activity Logs

**Location**: `.claude/activity/`

Each agent writes its own log:
- `.claude/activity/codex.log`
- `.claude/activity/antigravity.log`
- `.claude/activity/devpit.log`

View logs to debug workflow:

```bash
tail -f .claude/activity/*.log
```

## Workflow Stages

### Design Stage
- **Owner**: Claude Code
- **Input**: Feature requirements
- **Output**: `DESIGN.md`, task list
- **Next**: Implementation

### Implementation Stage
- **Owner**: Claude Code
- **Input**: Design spec
- **Output**: Code commits, tests
- **Next**: Polish (Codex)

### Polish Stage
- **Owner**: Codex
- **Input**: Code commits
- **Output**: Formatted commits
- **Next**: Testing (Antigravity)

### Testing Stage
- **Owner**: Antigravity
- **Input**: Formatted code
- **Output**: Test results, type report, coverage
- **Approval Required**: Yes
- **Next**: Review (DevPit)

### Approval Stage
- **Owner**: DevPit
- **Input**: Test results
- **Output**: Approval decision
- **Approval Required**: Yes
- **Next**: Merge

## Rules

| Rule | Enforced By | Level |
|------|-------------|-------|
| Must format code | Codex | Pre-commit |
| Must pass types | Antigravity | Before merge |
| Must pass lint | Antigravity | Before merge |
| Must have tests | Antigravity | Before merge |
| Must review changes | DevPit | Before main merge |

## Example Workflow

### Step 1: You write code in Claude Code
```bash
# Edit src/components/module/feature.tsx
# Test locally
git add src/components/module/feature.tsx
git commit -m "feat: add new feature"
```

### Step 2: Pre-commit hook triggers Codex
```
🔄 [Pre-commit] Triggering Codex auto-polish...
✅ [Pre-commit] Codex trigger queued
   Files staged: 1
   ⏳ Codex will format on next commit phase
```

### Step 3: Orchestrator sees task, runs Codex
```
🔄 Processing codex-format for codex
✅ Codex: Prettier formatting completed
✅ Codex: ESLint fixes applied
✅ Codex: Formatting complete, ready for Antigravity
```

### Step 4: File watcher detects changes, triggers Antigravity
```
📦 [Antigravity] Triggered by 1 file change(s)
   Files: src/components/module/feature.tsx
✅ Task queued for Antigravity
```

### Step 5: Orchestrator runs Antigravity tests
```
🔄 Triggering Antigravity for local testing...
✅ Antigravity: TypeScript check passed
✅ Antigravity: ESLint passed
✅ Antigravity: Tests passed
✅ Antigravity: All validations passed! Ready for DevPit review
```

### Step 6: DevPit notifies for final review
```
📋 DEVPIT - CHANGE SUMMARY AWAITING APPROVAL
================================================
{
  "workflow": "feature_development",
  "stage": "approval",
  "tests_passed": true,
  "ready_for_merge": false
}
================================================
```

## Customization

### Add New Workflow

Edit `.claude/workflows/devpit-config.yaml`:

```yaml
workflows:
  your_workflow:
    name: Your Workflow
    stages:
      - stage: stage_name
        agent: claude-code
        name: Human Readable Name
        tasks:
          - task 1
          - task 2
```

### Change Polling Interval

Edit `.claude/coordinator/orchestrator.js`:

```javascript
this.pollingInterval = 2000; // Change to desired ms
```

### Add New File Watch Pattern

Edit `.claude/watchers/file-watcher.js`:

```javascript
const WATCH_DIRS = [
  'src',
  'supabase/migrations',
  'your-new-dir'  // Add here
];
```

## Troubleshooting

### Agents not triggering?

1. Check orchestrator is running:
   ```bash
   ps aux | grep orchestrator
   ```

2. Check task queue has `status: "pending"`:
   ```bash
   cat .claude/orchestration/task-queue.json
   ```

3. Check activity logs:
   ```bash
   tail -n 20 .claude/activity/*.log
   ```

### Tests failing?

Run Antigravity manually:
```bash
npx tsc --noEmit
npx eslint src/
npm test
```

### File watcher not working?

Restart it:
```bash
pkill -f file-watcher
node .claude/watchers/file-watcher.js &
```

### Pre-commit hook not running?

Ensure it's executable:
```bash
chmod +x .git/hooks/pre-commit
```

Test directly:
```bash
bash .git/hooks/pre-commit
```

## Next Steps

1. **Install pre-commit hook**:
   ```bash
   cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

2. **Start file watcher**:
   ```bash
   node .claude/watchers/file-watcher.js &
   ```

3. **Start orchestrator**:
   ```bash
   node .claude/coordinator/orchestrator.js &
   ```

4. **Make a change and commit**:
   ```bash
   # Edit a file
   git add <file>
   git commit -m "test: orchestration flow"
   ```

5. **Watch the magic**:
   - Pre-commit hook → Codex formats
   - File watcher → Antigravity tests
   - Orchestrator → Coordinates all

## Monitoring

Open 4 terminals:

```bash
# Terminal 1: Orchestrator
node .claude/coordinator/orchestrator.js

# Terminal 2: File watcher
node .claude/watchers/file-watcher.js

# Terminal 3: Activity logs
tail -f .claude/activity/*.log

# Terminal 4: Your work
# Make commits, watch the flow!
```

---

**Status**: Orchestration layer ready for testing
**Last updated**: 2026-04-26
