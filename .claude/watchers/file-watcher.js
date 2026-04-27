#!/usr/bin/env node

/**
 * File Watcher for Antigravity Integration
 *
 * Watches for changes in src/ and triggers Antigravity for:
 * - Type checking
 * - Test running
 * - Lint validation
 * - Local feedback
 *
 * Usage: node .claude/watchers/file-watcher.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WATCH_DIRS = [
  'src',
  'supabase/migrations'
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.next/,
  /dist/,
  /\.git/,
  /\.claude/,
  /coverage/
];

const DEBOUNCE_MS = 2000;
let debounceTimer = null;
let changedFiles = new Set();

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

function debounce() {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    if (changedFiles.size > 0) {
      triggerAntigravity(Array.from(changedFiles));
      changedFiles.clear();
    }
  }, DEBOUNCE_MS);
}

function triggerAntigravity(files) {
  console.log(`\n📦 [Antigravity] Triggered by ${files.length} file change(s)`);
  console.log(`   Files: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3} more` : ''}`);

  // Update task queue
  const taskQueuePath = '.claude/orchestration/task-queue.json';
  const timestamp = new Date().toISOString();

  try {
    const taskQueue = {
      last_trigger: 'file-watcher',
      triggered_at: timestamp,
      action: 'antigravity-test',
      files: files,
      status: 'pending'
    };

    fs.writeFileSync(taskQueuePath, JSON.stringify(taskQueue, null, 2));
    console.log(`✅ Task queued for Antigravity`);
  } catch (e) {
    console.error(`❌ Failed to update task queue: ${e.message}`);
  }

  // Log to agent activity file
  logActivity('antigravity', 'triggered', {
    file_count: files.length,
    files: files.slice(0, 5)
  });
}

function logActivity(agent, action, data) {
  const activityDir = '.claude/activity';
  if (!fs.existsSync(activityDir)) {
    fs.mkdirSync(activityDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${agent}: ${action}\n`;
  const logFile = path.join(activityDir, `${agent}.log`);

  fs.appendFileSync(logFile, logEntry);
}

function watchDirectory(dir) {
  console.log(`👁️  Watching: ${dir}`);

  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename || shouldIgnore(filename)) return;

    const fullPath = path.join(dir, filename);

    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) return;

      console.log(`   📝 Changed: ${fullPath}`);
      changedFiles.add(fullPath);
      debounce();
    } catch (e) {
      // File deleted, that's ok
    }
  });
}

// Setup
console.log(`🚀 Starting file watcher for Antigravity integration`);
console.log(`   Config: .claude/orchestration/config.json`);

WATCH_DIRS.forEach(dir => {
  if (fs.existsSync(dir)) {
    watchDirectory(dir);
  }
});

console.log(`✅ Watcher ready. Ctrl+C to stop.\n`);

process.on('SIGINT', () => {
  console.log('\n\n👋 Watcher stopped');
  process.exit(0);
});
