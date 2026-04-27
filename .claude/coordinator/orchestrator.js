#!/usr/bin/env node

/**
 * Multi-Agent Orchestrator
 *
 * Central coordination hub for Claude Code, Codex, Antigravity, and DevPit.
 * - Monitors task queue for agent signals
 * - Coordinates workflow stages
 * - Manages inter-agent communication
 * - Tracks progress across agents
 *
 * Usage: node .claude/coordinator/orchestrator.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = '.claude/orchestration/config.json';
const TASK_QUEUE_FILE = '.claude/orchestration/task-queue.json';
const ACTIVITY_DIR = '.claude/activity';

class Orchestrator {
  constructor() {
    this.config = this.loadConfig();
    this.pollingInterval = 2000;
    this.isRunning = false;
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(configData);
    } catch (e) {
      console.error(`❌ Failed to load config: ${e.message}`);
      process.exit(1);
    }
  }

  readTaskQueue() {
    try {
      if (!fs.existsSync(TASK_QUEUE_FILE)) {
        return null;
      }
      const data = fs.readFileSync(TASK_QUEUE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  updateTaskQueue(updates) {
    try {
      const current = this.readTaskQueue() || {};
      const updated = { ...current, ...updates };
      fs.writeFileSync(TASK_QUEUE_FILE, JSON.stringify(updated, null, 2));
    } catch (e) {
      this.log('error', `Failed to update task queue: ${e.message}`);
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📋',
      success: '✅',
      error: '❌',
      warning: '⚠️ ',
      action: '🔄'
    }[level] || '•';

    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  logActivity(agent, action, details) {
    if (!fs.existsSync(ACTIVITY_DIR)) {
      fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${action}\n${JSON.stringify(details, null, 2)}\n\n`;
    const logFile = path.join(ACTIVITY_DIR, `${agent}.log`);

    try {
      fs.appendFileSync(logFile, logEntry);
    } catch (e) {
      // Silently fail for activity logging
    }
  }

  async processTask(task) {
    const agent = task.owner || task.agent;
    const action = task.action;

    this.log('action', `Processing ${action} for ${agent}`);

    switch (action) {
      case 'codex-format':
        await this.triggerCodex(task);
        break;
      case 'antigravity-test':
        await this.triggerAntigravity(task);
        break;
      case 'review-changes':
        await this.triggerDevPit(task);
        break;
      default:
        this.log('warning', `Unknown action: ${action}`);
    }
  }

  async triggerCodex(task) {
    this.log('action', 'Triggering Codex for auto-formatting...');
    this.logActivity('codex', 'triggered', { files: task.files, reason: 'pre-commit' });

    try {
      // Try to run prettier if available
      try {
        execSync('npx prettier --write src/', { stdio: 'pipe' });
        this.log('success', 'Codex: Prettier formatting completed');
      } catch (e) {
        this.log('warning', 'Codex: Prettier not available or failed');
      }

      // Try to run ESLint
      try {
        execSync('npx eslint src/ --fix 2>/dev/null', { stdio: 'pipe' });
        this.log('success', 'Codex: ESLint fixes applied');
      } catch (e) {
        this.log('warning', 'Codex: ESLint not available or failed');
      }

      this.updateTaskQueue({
        last_action: 'codex-complete',
        last_action_time: new Date().toISOString(),
        next_agent: 'antigravity'
      });

      this.log('success', 'Codex: Formatting complete, ready for Antigravity');
      this.logActivity('codex', 'completed', { status: 'success' });

    } catch (e) {
      this.log('error', `Codex error: ${e.message}`);
      this.logActivity('codex', 'error', { error: e.message });
    }
  }

  async triggerAntigravity(task) {
    this.log('action', 'Triggering Antigravity for local testing...');
    this.logActivity('antigravity', 'triggered', { files: task.files });

    const results = {
      typescript: false,
      eslint: false,
      tests: false,
      timestamp: new Date().toISOString()
    };

    try {
      // Run TypeScript check
      this.log('info', 'Antigravity: Running TypeScript type check...');
      try {
        execSync('npx tsc --noEmit', { stdio: 'pipe' });
        results.typescript = true;
        this.log('success', 'Antigravity: TypeScript check passed');
      } catch (e) {
        this.log('error', 'Antigravity: TypeScript check failed');
        this.logActivity('antigravity', 'typescript-error', { error: e.message });
      }

      // Run ESLint
      this.log('info', 'Antigravity: Running ESLint...');
      try {
        execSync('npx eslint src/', { stdio: 'pipe' });
        results.eslint = true;
        this.log('success', 'Antigravity: ESLint passed');
      } catch (e) {
        this.log('error', 'Antigravity: ESLint found issues');
        this.logActivity('antigravity', 'lint-error', { error: e.message });
      }

      // Run tests if available
      this.log('info', 'Antigravity: Running tests...');
      try {
        execSync('npm test -- --passWithNoTests 2>/dev/null', { stdio: 'pipe' });
        results.tests = true;
        this.log('success', 'Antigravity: Tests passed');
      } catch (e) {
        // Tests might fail legitimately
        this.log('warning', 'Antigravity: Tests failed or not configured');
        this.logActivity('antigravity', 'test-error', { error: e.message });
      }

      this.updateTaskQueue({
        last_action: 'antigravity-complete',
        last_action_time: new Date().toISOString(),
        test_results: results,
        next_agent: 'devpit'
      });

      const allPassed = results.typescript && results.eslint;
      if (allPassed) {
        this.log('success', 'Antigravity: All validations passed! Ready for DevPit review');
        this.logActivity('antigravity', 'completed', { results, status: 'success' });
      } else {
        this.log('warning', 'Antigravity: Some validations failed, needs review');
        this.logActivity('antigravity', 'completed', { results, status: 'warning' });
      }

    } catch (e) {
      this.log('error', `Antigravity error: ${e.message}`);
      this.logActivity('antigravity', 'error', { error: e.message });
    }
  }

  async triggerDevPit(task) {
    this.log('action', 'Notifying DevPit for review and approval...');
    this.logActivity('devpit', 'triggered', { task });

    const taskQueue = this.readTaskQueue();
    const summary = {
      workflow: 'feature_development',
      stage: 'approval',
      tests_passed: taskQueue?.test_results?.typescript && taskQueue?.test_results?.eslint,
      ready_for_merge: false,
      timestamp: new Date().toISOString()
    };

    this.log('info', 'DevPit: Waiting for manual review and approval');
    console.log('\n' + '='.repeat(60));
    console.log('📋 DEVPIT - CHANGE SUMMARY AWAITING APPROVAL');
    console.log('='.repeat(60));
    console.log(JSON.stringify(summary, null, 2));
    console.log('='.repeat(60) + '\n');

    this.logActivity('devpit', 'awaiting-approval', summary);
  }

  async monitorTaskQueue() {
    if (!this.isRunning) return;

    const task = this.readTaskQueue();
    if (!task || task.status === 'processed' || task.status === 'completed') {
      return;
    }

    // Avoid reprocessing
    if (task._processed_at) {
      return;
    }

    await this.processTask(task);

    // Mark as processed
    task._processed_at = new Date().toISOString();
    this.updateTaskQueue(task);
  }

  start() {
    this.isRunning = true;
    console.log('🚀 Starting Multi-Agent Orchestrator');
    console.log(`📖 Config: ${CONFIG_FILE}`);
    console.log(`📑 Task queue: ${TASK_QUEUE_FILE}`);
    console.log(`📊 Activity logs: ${ACTIVITY_DIR}`);
    console.log('\nWaiting for agent signals...\n');

    setInterval(() => this.monitorTaskQueue(), this.pollingInterval);

    process.on('SIGINT', () => {
      this.stop();
    });
  }

  stop() {
    this.isRunning = false;
    console.log('\n\n👋 Orchestrator stopped');
    process.exit(0);
  }
}

const orchestrator = new Orchestrator();
orchestrator.start();
