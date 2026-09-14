# Adding Agents

This repo already has a custom queue-based orchestration layer under `.claude/`.

Important truth:

Adding a new agent is not just a docs or YAML change.
A new agent becomes real only when you wire it into the runtime.

## Two Agent Systems

There are two different meanings of "agent" around this project:

1. Codex subagents in the IDE
   These are temporary helper agents spawned inside the coding session.
   They help with research, review, or parallel work, but they are not part of the repo runtime.

2. Repo runtime agents in `.claude/`
   These are long-lived workflow actors like `codex`, `antigravity`, and `devpit`.
   They are triggered by git hooks, file watching, or queue writes.

This document is about the second kind.

## What Actually Makes An Agent Real

Today, the runtime is hardcoded around a small number of queue actions.

The real execution path is:

- a producer writes a task into `.claude/orchestration/task-queue.json`
- `.claude/coordinator/orchestrator.js` polls that file
- `processTask()` switches on `task.action`
- a matching `triggerX()` handler runs

If your new agent does not have:

- an action producer
- a dispatch case in the orchestrator
- a handler implementation

then it does not actually exist, even if it appears in config files.

## Files You Must Touch

To add a new runtime agent, edit these files as needed:

1. `.claude/coordinator/orchestrator.js`
   Add:
   - a new `case` inside `processTask()`
   - a new `triggerYourAgent()` function

2. A producer that writes the task
   Choose one:
   - `.claude/hooks/pre-commit.sh` for git-triggered work
   - `.claude/watchers/file-watcher.js` for file-change-triggered work
   - another script or API that writes `.claude/orchestration/task-queue.json`

3. `.claude/orchestration/config.json`
   Document the agent definition here.
   Important: this file is currently descriptive more than authoritative.

4. `.claude/workflows/devpit-config.yaml`
   Add the agent to workflow docs if it participates in named workflows.
   Important: the current orchestrator does not execute this YAML directly.

5. `.claude/COMMUNICATION_GUIDE.md` or `.claude/ORCHESTRATION.md`
   Update docs so humans know how to trigger and monitor the new agent.

## Current Runtime Limits

Before adding more agents, know the current constraints:

1. The queue is a single JSON file, not a real queue.
   New writes overwrite previous tasks.

2. `orchestrator.js` only knows these actions today:
   - `codex-format`
   - `antigravity-test`
   - `review-changes`

3. The docs and YAML describe more than the runtime actually executes.

4. `next_agent` fields are informational right now.
   They do not automatically enqueue the next task.

5. The pre-commit hook checks `config.json` loosely.
   It does not robustly verify that a specific agent is enabled.

## Minimal Checklist

Use this checklist when adding a new runtime agent:

- Define the agent in `.claude/orchestration/config.json`
- Decide the trigger action name
- Add a producer that writes that action into `task-queue.json`
- Add a dispatch case in `orchestrator.js`
- Implement `triggerYourAgent()`
- Write activity logs to `.claude/activity/your-agent.log`
- Update docs
- Test one end-to-end trigger manually

## Example: Add `researcher`

Example goal:
Create a runtime agent called `researcher` that runs public-web research for a project.

### Step 1: Add the agent to config

Add an entry in `.claude/orchestration/config.json`:

```json
{
  "researcher": {
    "name": "Researcher",
    "role": "public-web project research",
    "model": "claude-sonnet-4",
    "triggers": ["manual", "project.research-requested"],
    "outputs": ["research suggestions", "source notes"],
    "dependencies": []
  }
}
```

This documents the agent, but does not make it run by itself.

### Step 2: Add a producer

Some process must write a task like this:

```json
{
  "last_trigger": "manual",
  "triggered_at": "2026-04-29T12:00:00Z",
  "action": "researcher-run",
  "project_id": "your-project-id",
  "status": "pending"
}
```

This can come from:

- a shell script
- a UI endpoint
- a watcher
- a git hook

### Step 3: Add dispatcher support

In `.claude/coordinator/orchestrator.js`, extend `processTask()`:

```javascript
case 'researcher-run':
  await this.triggerResearcher(task);
  break;
```

Then implement:

```javascript
async triggerResearcher(task) {
  this.log('action', `Triggering Researcher for project ${task.project_id}...`);
  this.logActivity('researcher', 'triggered', { projectId: task.project_id });

  try {
    // Run the actual work here
    // Example: call node script, API, or internal function

    this.updateTaskQueue({
      last_action: 'researcher-complete',
      last_action_time: new Date().toISOString(),
      next_agent: 'devpit'
    });

    this.log('success', 'Researcher completed');
    this.logActivity('researcher', 'completed', { status: 'success' });
  } catch (e) {
    this.log('error', `Researcher error: ${e.message}`);
    this.logActivity('researcher', 'error', { error: e.message });
  }
}
```

### Step 4: Test it

Write a manual task to `.claude/orchestration/task-queue.json`, then run:

```bash
node .claude/coordinator/orchestrator.js
```

If everything is wired correctly, you should see:

- orchestrator console output
- `.claude/activity/researcher.log`
- updated task queue fields

## Recommended Next Improvement

If you plan to add several more runtime agents, improve the orchestration layer first.

Best next engineering upgrades:

1. replace the single JSON file with an append-only queue
2. make `orchestrator.js` map actions from config instead of hardcoded switches
3. make `next_agent` enqueue real follow-up work
4. make enable/disable checks agent-specific
5. move workflow execution logic closer to `devpit-config.yaml`

Without those changes, additional agents will work, but the system will stay fragile.

## For Coding Agents

If another coding agent is asked to "add a new agent", tell it this:

Do not only edit `.claude/orchestration/config.json` or `.claude/workflows/devpit-config.yaml`.
You must also:

- add a producer for a new `action`
- add a dispatcher case in `.claude/coordinator/orchestrator.js`
- implement the handler
- test the trigger end to end

Otherwise the new agent is only documentation, not runtime behavior.
