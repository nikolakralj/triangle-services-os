# How to Communicate with Your Agents

Where and how to talk to Claude Code, Codex, Antigravity, and DevPit.

## Quick Answer

| Agent | Where | How |
|-------|-------|-----|
| 🧠 **Claude Code** (You) | Claude Code IDE | Direct messages here |
| 🎨 **Codex** | GitHub/Git | Via commits + PRs |
| 🧪 **Antigravity** | File changes | Edit `src/` files |
| 🚀 **DevPit** | Task queue | Update `.claude/orchestration/task-queue.json` |

---

## 🧠 Claude Code (This is You)

**Where**: Right here in Claude Code
**Status**: Active (you're using it now)
**Response Time**: Immediate

### How to Communicate
```
You: Type messages directly here
Me: Respond immediately in this chat

Example:
  You: "Add authentication to dashboard"
  Me: "I'll design the auth flow and implement..."
```

### What I Can Do
- ✅ Design features
- ✅ Write code
- ✅ Debug issues
- ✅ Create commits
- ✅ Plan architecture
- ✅ Answer questions
- ✅ Review errors

### Example Conversation

```
You: "I need to add a new Company field called 'estimatedRevenue'"

Me: I'll:
  1. Update database schema
  2. Create migration
  3. Update TypeScript types
  4. Update data functions
  5. Commit changes
  6. Codex will auto-format
  7. Antigravity will test
  8. DevPit will review
```

---

## 🎨 Codex (Auto-Polish)

**Where**: Git pre-commit hook
**Status**: Automatic (no direct communication)
**Response Time**: <2 seconds per commit

### How to Communicate

#### ✅ Indirect Communication (Recommended)
```bash
# Make code changes and commit
git add src/components/feature.tsx
git commit -m "feat: add new feature"

# Codex automatically:
# ✅ Runs prettier
# ✅ Runs eslint --fix
# ✅ Formats everything
```

#### 🔧 Direct Instructions (Advanced)
Edit `.claude/orchestration/config.json`:

```json
{
  "codex": {
    "instructions": "Use 2-space indentation",
    "rules": [
      "enforce-semicolons",
      "max-line-length: 100"
    ]
  }
}
```

#### 📊 Monitor Codex Output
```bash
# Watch Codex run in real-time
tail -f .claude/activity/codex.log

# Output example:
# [2026-04-27T10:30:00Z] triggered
# [2026-04-27T10:30:01Z] prettier completed
# [2026-04-27T10:30:02Z] eslint --fix completed
# [2026-04-27T10:30:03Z] completed
```

### What Codex Does

Runs automatically on every commit:
```
git commit
  ↓
Pre-commit hook triggers
  ↓
Codex processes:
  • prettier --write src/
  • eslint --fix src/
  ↓
Auto-formatted code ready for next agent
```

### Communication Examples

```bash
# Implicit: Your code quality determines if Codex has work
git add src/messy-file.tsx
git commit -m "feat: new feature"
# Codex sees unformatted code → Auto-fixes

# Explicit: Change Codex behavior via config
# Edit .claude/orchestration/config.json
# Add formatting rules → Codex applies them
```

---

## 🧪 Antigravity (Local Testing)

**Where**: File watcher monitors `src/`
**Status**: Automatic (triggered by file changes)
**Response Time**: 6-8 seconds per validation

### How to Communicate

#### ✅ Indirect Communication (Recommended)
```bash
# Edit files in src/
echo "// new code" >> src/lib/utils.ts

# File watcher automatically:
# ✅ Detects changes
# ✅ Triggers Antigravity
# ✅ Runs TypeScript check
# ✅ Runs ESLint
# ✅ Reports results
```

#### 🔧 Direct Instructions (Advanced)

1. **Edit test requirements**:
```json
{
  "antigravity": {
    "validate": ["typescript", "eslint"],
    "test_patterns": ["**/*.test.ts"],
    "coverage_minimum": 80
  }
}
```

2. **Manually trigger**:
Edit `.claude/orchestration/task-queue.json`:
```json
{
  "action": "antigravity-test",
  "files": ["src/lib/utils.ts"],
  "status": "pending"
}
```

Orchestrator detects and runs Antigravity immediately.

#### 📊 Monitor Antigravity Output
```bash
# Real-time monitoring
tail -f .claude/activity/antigravity.log

# Output example:
# [2026-04-27T10:30:05Z] triggered by file-watcher
# [2026-04-27T10:30:06Z] TypeScript check started
# [2026-04-27T10:30:09Z] TypeScript check passed
# [2026-04-27T10:30:10Z] ESLint started
# [2026-04-27T10:30:12Z] ESLint passed
# [2026-04-27T10:30:13Z] All validations passed
```

### What Antigravity Does

Runs automatically on file changes:
```
File change in src/
  ↓
File watcher detects
  ↓
Antigravity processes:
  • npx tsc --noEmit
  • npx eslint src/
  • npm test (if configured)
  ↓
Reports results to DevPit
```

### Communication Examples

```bash
# Implicit: Your code quality determines validation
echo "const x: string = 123;" >> src/utils.ts
# Antigravity detects type error → Reports

# Explicit: Request specific validation
# Edit task-queue.json with "antigravity-test" action
# Antigravity runs immediately
```

---

## 🚀 DevPit (Approval & Orchestration)

**Where**: Task queue + approval workflow
**Status**: Semi-automatic (awaits approval)
**Response Time**: 4-6 seconds per review

### How to Communicate

#### ✅ Explicit Instructions (Recommended)

1. **Request approval**:
Edit `.claude/orchestration/task-queue.json`:
```json
{
  "action": "review-changes",
  "workflow": "feature_development",
  "test_results": {
    "typescript": true,
    "eslint": true
  },
  "status": "pending"
}
```

DevPit reviews and responds.

2. **Give approval instructions**:
```json
{
  "devpit_instructions": {
    "review_criteria": [
      "all-tests-pass",
      "typescript-clean",
      "coverage > 80%"
    ],
    "auto_approve_if": {
      "all_tests_pass": true,
      "no_breaking_changes": true
    }
  }
}
```

#### 📊 Monitor DevPit Output
```bash
# Watch approval workflow
tail -f .claude/activity/devpit.log

# View approval summary
cat .claude/orchestration/task-queue.json | jq '.approval_summary'

# Example output:
# {
#   "status": "pending-approval",
#   "files_changed": 1,
#   "tests_passed": true,
#   "recommendation": "approve-and-merge"
# }
```

#### ✍️ Provide Feedback to DevPit

After DevPit reviews, you can:

```bash
# If you approve:
# (Merge to main or create PR)
git push origin main

# If you want changes:
# Edit the files and recommit
git add src/
git commit -m "refactor: address review feedback"
# DevPit reviews again automatically
```

### What DevPit Does

Runs automatically after tests pass:
```
Tests complete (from Antigravity)
  ↓
DevPit triggered
  ↓
DevPit processes:
  • Reviews all changes
  • Checks quality metrics
  • Assesses risk
  • Makes approval decision
  ↓
Awaits user approval to merge
```

### Communication Examples

```json
// Request DevPit to review
{
  "action": "review-changes",
  "status": "pending"
}

// DevPit responds:
{
  "review_status": "ready-to-merge",
  "tests_passed": true,
  "quality_score": 95,
  "recommendation": "approve"
}

// You approve by merging
```

---

## 📡 Communication Channels Summary

### 1. **Direct Message** (Claude Code)
```
You: "Implement user registration"
Me: [Implement + Commit]
Response: Immediate
Channel: This IDE
```

### 2. **Git Commit Message** (Codex)
```
You: git commit -m "feat: add feature"
Codex: [Auto-format]
Response: <2 seconds
Channel: Pre-commit hook
```

### 3. **File Changes** (Antigravity)
```
You: [Edit src/file.ts]
Antigravity: [Test + Validate]
Response: 6-8 seconds
Channel: File watcher
```

### 4. **Task Queue** (DevPit)
```
You: [Update task-queue.json]
DevPit: [Review + Approve]
Response: 4-6 seconds
Channel: Task queue JSON
```

---

## 🔄 Complete Communication Flow

### Feature Request to Merge

```
1️⃣  YOU (Claude Code)
    ↓ Message here
    "Build company import from Excel"

2️⃣  ME (Claude Code)
    ↓ Implement
    • Design feature
    • Write code
    • Test locally
    • git commit -m "feat: ..."

3️⃣  CODEX (Auto-Polish)
    ↓ Pre-commit hook
    • Prettier formatting
    • ESLint fixes
    ✅ Ready for testing

4️⃣  ANTIGRAVITY (Testing)
    ↓ File watcher
    • TypeScript check ✅
    • ESLint check ✅
    • Tests run ✅
    ✅ Ready for approval

5️⃣  DEVPIT (Approval)
    ↓ Task queue
    • Reviews changes
    • Checks quality
    • Recommends: "Approve"
    ⏳ Awaits your approval

6️⃣  YOU (Final Approval)
    ↓ Your decision
    "Looks good, merge to main"
    ✅ Feature deployed
```

---

## 📝 Real Example: Add Database Field

### Step 1: Request (You → Claude Code)
```
You in this chat:
"Add 'estimatedRevenue' field to companies"

Me (Claude Code):
"I'll design and implement this..."
[Creates migration, updates types, commits]
```

### Step 2: Auto-Format (Codex)
```
Your commit automatically triggers:

Pre-commit hook runs
  ↓
Codex formats the code
  ↓
[task-queue.json updated]
```

Monitor:
```bash
tail -f .claude/activity/codex.log
# [2026-04-27...] prettier completed
# [2026-04-27...] eslint completed
```

### Step 3: Validation (Antigravity)
```
File changes detected:
  • migration file
  • types.ts
  • data/companies.ts
  
Antigravity validates:
  ✅ TypeScript compiles
  ✅ No type errors
  ✅ ESLint passes
```

Monitor:
```bash
tail -f .claude/activity/antigravity.log
# [2026-04-27...] TypeScript check passed
# [2026-04-27...] ESLint passed
```

### Step 4: Review (DevPit)
```
DevPit reviews:
  ✅ Database migration is safe
  ✅ Types are correct
  ✅ Code quality: 95%
  
Status: Ready for approval
```

Monitor:
```bash
cat .claude/orchestration/task-queue.json | jq
# {
#   "approval_status": "ready-to-merge",
#   "tests_passed": true
# }
```

### Step 5: Approve & Deploy
```
You approve:
git push origin main

Feature is live! ✅
```

---

## 💡 Pro Tips

### 1. Quick Agent Status Check
```bash
# Check if all agents are running
ps aux | grep -E "orchestrator|file-watcher"

# View task queue
cat .claude/orchestration/task-queue.json

# Check logs
ls -lh .claude/activity/*.log
```

### 2. Request Agent Focus
You can ask each agent to focus on specific tasks:

```bash
# Tell Claude Code (me):
# Direct message here
"Focus on performance optimizations"

# Tell Codex to enforce stricter rules:
# Edit config.json
{
  "codex": {
    "strict_mode": true,
    "max_line_length": 80
  }
}

# Tell Antigravity to require higher coverage:
# Edit config.json
{
  "antigravity": {
    "coverage_minimum": 90
  }
}

# Tell DevPit to be more cautious:
# Edit config.json
{
  "devpit": {
    "approval_level": "strict"
  }
}
```

### 3. Manual Agent Trigger
```bash
# Force Codex to format everything
cat > .claude/orchestration/task-queue.json <<EOF
{
  "action": "codex-format",
  "files": ["src/**/*"],
  "status": "pending"
}
EOF

# Force Antigravity to validate everything
cat > .claude/orchestration/task-queue.json <<EOF
{
  "action": "antigravity-test",
  "files": ["src/**/*"],
  "status": "pending"
}
EOF

# Force DevPit to review
cat > .claude/orchestration/task-queue.json <<EOF
{
  "action": "review-changes",
  "status": "pending"
}
EOF
```

### 4. Disable an Agent
```json
{
  "agents": {
    "codex": {
      "enabled": false
    }
  }
}
```

---

## 📊 Communication Latency

```
Claude Code ──────→ You: Instant (same IDE)
                    ↓
Git Commit ────────→ Codex: <2 seconds
                    ↓
File Change ──────→ Antigravity: 6-8 seconds
                    ↓
Tests Complete ───→ DevPit: 4-6 seconds
                    ↓
Your Approval ────→ Merge: Instant
```

Total workflow: ~26 seconds from commit to approval

---

## ✅ Communication Checklist

- [ ] Claude Code: Use this IDE for feature requests
- [ ] Codex: Commit code (auto-triggers)
- [ ] Antigravity: Edit files (auto-triggers)
- [ ] DevPit: Monitor approval workflow
- [ ] All: Check `.claude/activity/*.log` for responses

---

## Next: Try It Out

### Make a Real Feature Request

```bash
# You can try right now:
# 1. Message me here: "Add a test endpoint at /api/health"
# 2. I'll implement it
# 3. Git commit triggers Codex
# 4. File changes trigger Antigravity
# 5. Antigravity triggers DevPit
# 6. You see the full workflow
```

---

**Status**: All communication channels configured ✅
**Response Times**: 0-26 seconds depending on agent
**Next**: Try making a feature request and watch the agents work!
