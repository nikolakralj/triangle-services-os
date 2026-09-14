# Model Selection Strategy for Multi-Agent Orchestration

Which Claude model each agent uses, and why.

## Overview

Each agent is optimized for its specific role with a selected Claude model:

| Agent | Primary | Fallback | Cost | Speed | Reasoning |
|-------|---------|----------|------|-------|-----------|
| **Claude Code** | Opus 4 | Sonnet 4 | $$ | Medium | Complex decisions |
| **Codex** | Haiku | Sonnet 4 | $ | Fast | Simple formatting |
| **Antigravity** | Sonnet 4 | Opus 4 | $$ | Fast | Validation tasks |
| **DevPit** | Sonnet 4 | Opus 4 | $$ | Fast | Approval judgment |

---

## Detailed Breakdown

### 🧠 Claude Code (IDE Agent)
**Model**: `claude-opus-4` (with `claude-sonnet-4` fallback)

**Why Opus 4?**
- ✅ Best reasoning ability for complex architectural decisions
- ✅ Superior at understanding context across entire codebase
- ✅ Excellent for multi-step feature planning
- ✅ Better at identifying security/performance implications
- ✅ Strong at code reviews and refactoring suggestions

**Usage**:
- Feature architecture and design
- Complex bug diagnosis
- Code refactoring decisions
- Security/performance reviews
- Multi-file coordination

**Cost/Benefit**:
- Higher token cost (~$15/1M input)
- Worth it: This is where the most complex work happens
- Fallback to Sonnet 4 if needed (faster iteration)

**Example Tasks**:
```
"Design authentication flow for 10+ user roles"
"Refactor companies data layer for new fields"
"Plan database migration strategy"
```

---

### 🎨 Codex (Auto-Polish)
**Model**: `claude-haiku` (with `claude-sonnet-4` fallback)

**Why Haiku?**
- ✅ Fastest available model (critical for pre-commit hook)
- ✅ Excellent at code formatting and style fixes
- ✅ Perfectly capable for ESLint rule application
- ✅ Lowest cost (~$0.80/1M input tokens)
- ✅ No need for complex reasoning - just formatting

**Usage**:
- Prettier formatting
- ESLint auto-fixes
- Code style enforcement
- Naming conventions
- Import sorting

**Cost/Benefit**:
- Lowest cost agent
- Fastest execution (runs on every commit)
- Fallback to Sonnet 4 for complex style rules

**Performance**:
- Average execution: <2 seconds
- Can format up to 100 files in ~3 seconds
- Minimal overhead to commit workflow

**Example Tasks**:
```
"Format this TypeScript file with Prettier"
"Auto-fix ESLint violations"
"Enforce 80-char line length"
```

---

### 🧪 Antigravity (Local Testing)
**Model**: `claude-sonnet-4` (with `claude-opus-4` fallback)

**Why Sonnet 4?**
- ✅ Great balance of speed and accuracy
- ✅ Excellent at reading test output/errors
- ✅ Good at understanding TypeScript types
- ✅ Fast enough for real-time feedback
- ✅ Cost-effective for frequent runs

**Usage**:
- TypeScript type checking supervision
- ESLint output interpretation
- Test failure analysis
- Coverage report review
- Type error explanation

**Cost/Benefit**:
- Mid-range cost (~$3/1M input)
- Runs frequently (on file changes)
- Worth it: Provides actionable feedback
- Fallback to Opus 4 for complex type errors

**Performance**:
- Average execution: 6-8 seconds per run
- Can validate 67+ TypeScript files
- Provides detailed error context

**Example Tasks**:
```
"Analyze this TypeScript error and explain fix"
"Review ESLint report and summarize issues"
"Check if all new functions have proper types"
```

---

### 🚀 DevPit (Approval & Orchestration)
**Model**: `claude-sonnet-4` (with `claude-opus-4` fallback)

**Why Sonnet 4?**
- ✅ Good judgment for merge approvals
- ✅ Fast enough for interactive approval workflow
- ✅ Strong at understanding code quality implications
- ✅ Cost-effective for approval tasks
- ✅ Can read test results and make recommendations

**Usage**:
- Change review and approval
- Risk assessment
- Deployment readiness check
- Test result interpretation
- Quality gate decisions

**Cost/Benefit**:
- Mid-range cost (~$3/1M input)
- Runs infrequently (after tests pass)
- Worth it: Critical approval decision point
- Fallback to Opus 4 for complex architectural reviews

**Performance**:
- Average execution: 4-6 seconds per review
- Provides detailed approval reasoning
- Can reference full test results

**Example Tasks**:
```
"Review changes and approve for merge"
"Assess if new code meets quality standards"
"Check if tests pass and coverage is acceptable"
"Determine if deployment is safe"
```

---

## Cost Analysis

### Per-Workflow Cost (Feature Development)

**Typical workflow**: 1 feature commit

| Agent | Model | Token Cost | Frequency | Est. Cost |
|-------|-------|-----------|-----------|-----------|
| Claude Code | Opus 4 | High (planning) | 1x | $0.015 |
| Codex | Haiku | Very Low | 1x | $0.001 |
| Antigravity | Sonnet 4 | Low (validation) | 1x | $0.003 |
| DevPit | Sonnet 4 | Low (approval) | 1x | $0.003 |
| **Total** | Mixed | **Balanced** | **Per commit** | **~$0.022** |

**Annual estimate** (50 commits/month):
```
50 commits × 12 months × $0.022 = ~$13/year
```

Significantly cheaper than human code review! ✅

---

## When to Override

### Use Claude Opus 4 for Antigravity (instead of Sonnet 4)

**When**: Complex TypeScript types causing validation failures
**How**: Edit `config.json`:

```json
{
  "antigravity": {
    "primary": "claude-opus-4",
    "fallback": "claude-sonnet-4"
  }
}
```

### Use Claude Sonnet 4 for Codex (instead of Haiku)

**When**: Formatting edge cases or custom style rules
**How**: Edit `config.json`:

```json
{
  "codex": {
    "primary": "claude-sonnet-4",
    "fallback": "claude-haiku"
  }
}
```

### Use Claude Opus 4 for DevPit (instead of Sonnet 4)

**When**: High-risk changes (DB migrations, auth changes)
**How**: Edit `config.json`:

```json
{
  "devpit": {
    "primary": "claude-opus-4",
    "fallback": "claude-sonnet-4"
  }
}
```

---

## Configuration

Models are defined in `.claude/orchestration/config.json`:

```json
{
  "models": {
    "claude-code": {
      "primary": "claude-opus-4",
      "fallback": "claude-sonnet-4",
      "rationale": "Complex reasoning, architecture decisions"
    },
    "codex": {
      "primary": "claude-haiku",
      "fallback": "claude-sonnet-4",
      "rationale": "Simple formatting task, speed-optimized"
    },
    "antigravity": {
      "primary": "claude-sonnet-4",
      "fallback": "claude-opus-4",
      "rationale": "Balance of accuracy and speed"
    },
    "devpit": {
      "primary": "claude-sonnet-4",
      "fallback": "claude-opus-4",
      "rationale": "Good judgment for approvals"
    }
  }
}
```

---

## Claude Model Characteristics

### Opus 4
- **Speed**: Medium (slowest)
- **Intelligence**: Highest
- **Cost**: $15/1M input tokens
- **Best for**: Complex reasoning, architecture, planning
- **Overkill for**: Simple formatting, basic validation

### Sonnet 4
- **Speed**: Fast
- **Intelligence**: High
- **Cost**: $3/1M input tokens
- **Best for**: Balanced tasks (testing, approval)
- **Good for**: Most production use cases

### Haiku
- **Speed**: Fastest
- **Intelligence**: Good (sufficient for simple tasks)
- **Cost**: $0.80/1M input tokens
- **Best for**: Simple, fast tasks (formatting)
- **Not for**: Complex reasoning

---

## Recommendations

### For Development Speed
Use default configuration:
- Claude Code: **Opus 4** (best for complex features)
- Codex: **Haiku** (fastest formatting)
- Antigravity: **Sonnet 4** (good balance)
- DevPit: **Sonnet 4** (good judgment)

### For Cost Optimization
Consider switching to:
- Codex: Haiku → Haiku ✅ (already optimal)
- Antigravity: Sonnet 4 → Haiku ⚠️ (may miss complex types)
- Claude Code: Opus 4 → Sonnet 4 ⚠️ (less capable reasoning)

**Verdict**: Current config is already well-optimized.

### For Maximum Quality
Consider upgrading to:
- Claude Code: Opus 4 → Opus 4 ✅ (already optimal)
- Antigravity: Sonnet 4 → Opus 4 (better type checking)
- DevPit: Sonnet 4 → Opus 4 (higher approval confidence)

**Cost increase**: ~$0.01/workflow

---

## Testing Model Changes

To test a different model configuration:

1. **Edit config**:
   ```bash
   nano .claude/orchestration/config.json
   ```

2. **Make a test commit**:
   ```bash
   git add test-file.ts
   git commit -m "test: model configuration"
   ```

3. **Monitor logs**:
   ```bash
   tail -f .claude/activity/*.log
   ```

4. **Compare results** (speed, quality, cost)

---

## Summary

| Agent | Model | Role | Cost | Speed |
|-------|-------|------|------|-------|
| 🧠 Claude Code | **Opus 4** | Architecture | $$ | Medium |
| 🎨 Codex | **Haiku** | Formatting | $ | Fast ⚡ |
| 🧪 Antigravity | **Sonnet 4** | Testing | $$ | Fast ⚡ |
| 🚀 DevPit | **Sonnet 4** | Approval | $$ | Fast ⚡ |

**Total**: Optimized for speed, quality, and cost ✅

---

**Last updated**: 2026-04-27
