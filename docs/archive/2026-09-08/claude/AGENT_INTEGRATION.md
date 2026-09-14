# Agent Integration Guide

How Claude Code, Codex, Antigravity, and DevPit work together on Triangle Services OS.

## Agent Roles & Responsibilities

### 🧠 Claude Code (You - Main IDE Agent)

**Role**: Architecture, planning, feature development, problem-solving

**What it does**:
- Designs features and architecture
- Writes production code
- Creates tests and documentation
- Fixes bugs and refactors
- Reviews errors and debugging
- Makes strategic decisions

**Triggers next agents by**:
- Committing to git (→ Codex)
- Making file changes (→ Antigravity via file watcher)

**Example work**:
```bash
# You design a feature
# You write the code
# You commit
git commit -m "feat: add company import from Excel"

# Codex automatically formats it
# Antigravity automatically tests it
# DevPit asks for approval
```

### 🎨 Codex (Auto-Polish)

**Role**: Code formatting, style enforcement, minor fixes

**What it does**:
- Auto-formats code (Prettier)
- Runs ESLint fixes
- Enforces coding conventions
- Cleans up style issues
- Applies project conventions

**Triggered by**:
- Pre-commit hook (on every commit)
- Claude Code commit signal

**How it works**:
```javascript
// Before: Poorly formatted code
const    companies  =  data.map(item=>({id:item.id,name:item.name}))

// After: Codex formats it
const companies = data.map(item => ({
  id: item.id,
  name: item.name
}))
```

**Triangle Services OS specifics**:
- Formats TypeScript/TSX files in `src/`
- Enforces Prettier config
- Runs ESLint on staged files
- Maintains Next.js conventions

### 🧪 Antigravity (Local Testing)

**Role**: Local validation, type checking, test running

**What it does**:
- Runs TypeScript type checking
- Runs ESLint validation
- Runs Jest/Vitest tests
- Generates test coverage reports
- Reports issues back to Claude Code

**Triggered by**:
- File watcher detecting changes
- Codex completing formatting
- Test requirement signals

**How it works**:
```bash
# Antigravity automatically:
npx tsc --noEmit              # Check types
npx eslint src/               # Check style
npm test                      # Run tests

# Reports results:
{
  "typescript": true,         # ✅ Types OK
  "eslint": true,             # ✅ Lint OK
  "tests": true               # ✅ Tests pass
}
```

**Triangle Services OS specifics**:
- Type-checks Next.js 15+ App Router
- Tests React Server Components
- Validates Supabase types
- Tests database migrations
- Validates auth flows

### 🚀 DevPit (Workflow Orchestration)

**Role**: Coordinator, approver, deployer, workflow manager

**What it does**:
- Reviews test results
- Approves changes for merge
- Makes deployment decisions
- Tracks progress across workflow
- Coordinates between agents

**Triggered by**:
- Antigravity completing tests
- Manual approval requests
- Deployment decisions needed

**How it works**:
```json
{
  "workflow": "feature_development",
  "stage": "approval",
  "tests_passed": true,
  "typescript_check": "passed",
  "lint_check": "passed",
  "ready_for_merge": false,
  "next_action": "Manual approval from DevPit"
}
```

**Triangle Services OS specifics**:
- Tracks deployment to staging/production
- Manages database migration approvals
- Coordinates team reviews
- Logs all approvals and decisions

## Communication Flow

### Feature Development Workflow

```
START
 │
 ├─→ Claude Code writes feature
 │    └─→ git commit
 │
 ├─→ Pre-commit Hook
 │    └─→ signal: codex-format
 │
 ├─→ Codex runs
 │    ├─→ prettier --write
 │    ├─→ eslint --fix
 │    └─→ signal: formatting-complete
 │
 ├─→ File Watcher detects changes
 │    └─→ signal: antigravity-test
 │
 ├─→ Antigravity runs
 │    ├─→ tsc --noEmit
 │    ├─→ eslint
 │    ├─→ npm test
 │    └─→ signal: test-results
 │
 ├─→ Orchestrator routes to DevPit
 │    └─→ signal: approval-needed
 │
 ├─→ DevPit reviews
 │    ├─→ Check: tests passed?
 │    ├─→ Check: types OK?
 │    ├─→ Check: coverage good?
 │    └─→ signal: approval-decision
 │
 ├─→ If approved: merge to main
 │    └─→ notify Claude Code
 │
 └─→ END
```

### Bug Fix Workflow (Faster)

```
START
 │
 ├─→ Claude Code diagnoses bug
 │    └─→ creates fix
 │         └─→ git commit
 │
 ├─→ Codex formats (automatic)
 │    └─→ signal: ready-for-test
 │
 ├─→ Antigravity tests fix (automatic)
 │    ├─→ Run reproduction test
 │    ├─→ Run full test suite
 │    └─→ signal: fix-verified
 │
 ├─→ DevPit approves (fast track)
 │    └─→ Approve & merge
 │
 └─→ END
```

## Integration Points

### Git Hooks → Codex

**File**: `.git/hooks/pre-commit`
**Source**: `.claude/hooks/pre-commit.sh`

When you commit:
1. Git runs pre-commit hook
2. Hook detects staged TypeScript files
3. Hook writes to task queue
4. Orchestrator processes → Codex runs

```bash
git add src/components/ui/button.tsx
git commit -m "feat: ..."
# → pre-commit hook runs
# → writes to task-queue.json
# → orchestrator detects
# → Codex processes
```

### File Watcher → Antigravity

**File**: `.claude/watchers/file-watcher.js`

When files change in `src/`:
1. File watcher detects change
2. Debounces for 2 seconds
3. Writes to task queue
4. Orchestrator processes → Antigravity runs

```javascript
// Edit src/components/ui/button.tsx
// → file watcher detects
// → task-queue updated
// → orchestrator detects
// → Antigravity runs tests
```

### Orchestrator → All Agents

**File**: `.claude/coordinator/orchestrator.js`

Central hub that:
1. Monitors task queue
2. Routes to correct agent
3. Logs activity
4. Updates status

```json
// In task-queue.json
{
  "action": "codex-format",  // Orchestrator routes here
  "status": "pending"
}

// Orchestrator processes it and updates:
{
  "action": "codex-format",
  "status": "completed",
  "next_agent": "antigravity"
}
```

### DevPit → Approval System

**File**: Managed by task queue and orchestrator logs

DevPit's role:
1. Receives test results from Antigravity
2. Reviews change summary
3. Makes approval decision
4. Signals back to system

```bash
# DevPit output
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

## Task Queue Communication

Agents communicate via `.claude/orchestration/task-queue.json`:

```json
{
  "last_trigger": "pre-commit",
  "triggered_at": "2026-04-26T10:30:00Z",
  "action": "codex-format",
  "files": ["src/components/ui/button.tsx"],
  "status": "pending"
}
```

**Status values**:
- `pending`: Waiting to be processed
- `processing`: Currently running
- `completed`: Done, next agent ready
- `failed`: Error occurred

## For Triangle Services OS Specifically

### What Each Agent Validates

**Codex**:
- TypeScript/TSX formatting
- Next.js 15 conventions
- React component patterns
- Supabase client usage

**Antigravity**:
- TypeScript compilation (Next.js config)
- ESLint rules for React Server Components
- Database type safety (generated types)
- Authentication flow types
- API route types

**DevPit**:
- Database migration safety
- RLS policy changes
- New external integrations (webhooks, etc.)
- Major architectural changes
- Team review requirements

### Example: Adding New Company Field

**Your workflow as Claude Code**:

```typescript
// 1. Add to database schema
// supabase/migrations/020_add_company_field.sql
ALTER TABLE companies ADD COLUMN estimated_revenue INT;

// 2. Update TypeScript type
// src/lib/types.ts
export interface Company {
  // ...
  estimatedRevenue?: number;
}

// 3. Update data functions
// src/lib/data/companies.ts
const rowToCompany = (row: any): Company => ({
  // ...
  estimatedRevenue: row.estimated_revenue
});

// 4. Commit
git add supabase/migrations/020_*.sql src/lib/types.ts src/lib/data/companies.ts
git commit -m "feat: add estimated revenue field to companies"
```

**Codex automatically**:
- Formats the TypeScript
- Ensures naming conventions
- Fixes any linting issues

**Antigravity automatically**:
- Type-checks the new field
- Verifies migrations apply cleanly
- Tests data functions
- Runs full test suite

**DevPit reviews**:
- Database schema change (approval needed)
- Data migration plan (approval needed)
- Breaking change assessment

---

## Running Both Services

### Setup (Once)

```bash
# Install git hook
cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Start Services

```bash
# Start all in one command
bash .claude/start-all.sh

# Or manually:
node .claude/coordinator/orchestrator.js &
node .claude/watchers/file-watcher.js &
```

### Watch It Happen

```bash
# Monitor all logs
tail -f .claude/activity/*.log

# Or specific agent
tail -f .claude/activity/codex.log
```

### Make a Commit

```bash
# Edit something
echo "// your change" >> src/lib/utils.ts

# Commit (agents activate!)
git add src/lib/utils.ts
git commit -m "test: your change"

# Watch logs fill up!
```

## Status

✅ **All agents configured and integrated**
✅ **Communication channels established**
✅ **Workflows defined for Triangle Services OS**
✅ **Ready to orchestrate development**

Next step: Make your first coordinated change!

```bash
bash .claude/start-all.sh
# [make a code change]
git commit
# [watch the agents work]
```

---

**Questions?** See:
- `.claude/ORCHESTRATION.md` - Full reference
- `.claude/QUICK_START.md` - Fast setup
- `.claude/workflows/devpit-config.yaml` - Workflow definitions
