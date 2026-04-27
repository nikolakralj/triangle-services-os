#!/bin/bash

# Multi-Agent Orchestration - Start All Services
#
# Starts:
# - Orchestrator (coordinator hub)
# - File watcher (Antigravity trigger)
# - Pre-commit hook setup
#
# Usage: bash .claude/start-all.sh

set -e

echo "🚀 Starting Triangle Services OS - Multi-Agent Orchestration"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "${BLUE}📋 Checking prerequisites...${NC}"

if [ ! -d ".git" ]; then
    echo "${YELLOW}⚠️  Not a git repository${NC}"
    exit 1
fi

if [ ! -f ".claude/orchestration/config.json" ]; then
    echo "${YELLOW}⚠️  Orchestration config not found${NC}"
    exit 1
fi

# Create activity directory
mkdir -p .claude/activity

# Setup git hook
echo ""
echo "${BLUE}🔧 Setting up git pre-commit hook...${NC}"
if [ -f ".claude/hooks/pre-commit.sh" ]; then
    cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    echo "${GREEN}✅ Pre-commit hook installed${NC}"
else
    echo "${YELLOW}⚠️  Pre-commit hook not found${NC}"
fi

# Kill any existing processes
echo ""
echo "${BLUE}🛑 Cleaning up existing processes...${NC}"
pkill -f "node .claude/coordinator/orchestrator.js" 2>/dev/null || true
pkill -f "node .claude/watchers/file-watcher.js" 2>/dev/null || true
sleep 1

# Start orchestrator
echo ""
echo "${BLUE}🎯 Starting Orchestrator...${NC}"
node .claude/coordinator/orchestrator.js > .claude/activity/orchestrator.log 2>&1 &
ORCHESTRATOR_PID=$!
echo "${GREEN}✅ Orchestrator started (PID: $ORCHESTRATOR_PID)${NC}"

# Start file watcher
echo ""
echo "${BLUE}👁️  Starting File Watcher...${NC}"
node .claude/watchers/file-watcher.js > .claude/activity/watcher.log 2>&1 &
WATCHER_PID=$!
echo "${GREEN}✅ File Watcher started (PID: $WATCHER_PID)${NC}"

# Summary
echo ""
echo "${GREEN}════════════════════════════════════════════════${NC}"
echo "${GREEN}✅ Multi-Agent Orchestration Ready${NC}"
echo "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Services running:"
echo "   • Orchestrator (PID: $ORCHESTRATOR_PID)"
echo "   • File Watcher (PID: $WATCHER_PID)"
echo "   • Pre-commit Hook (Git)"
echo ""
echo "📖 Configuration:"
echo "   • Config: .claude/orchestration/config.json"
echo "   • Task Queue: .claude/orchestration/task-queue.json"
echo "   • Workflows: .claude/workflows/devpit-config.yaml"
echo ""
echo "📊 Logs:"
echo "   • Orchestrator: .claude/activity/orchestrator.log"
echo "   • File Watcher: .claude/activity/watcher.log"
echo "   • Agents: .claude/activity/{codex,antigravity,devpit}.log"
echo ""
echo "🔍 Monitor workflow:"
echo "   tail -f .claude/activity/*.log"
echo ""
echo "🛑 Stop services:"
echo "   pkill -f orchestrator"
echo "   pkill -f file-watcher"
echo ""
echo "📚 Documentation:"
echo "   cat .claude/ORCHESTRATION.md"
echo ""

# Wait and check services
sleep 2
if ps -p $ORCHESTRATOR_PID > /dev/null; then
    echo "${GREEN}✓ Orchestrator is running${NC}"
else
    echo "${YELLOW}✗ Orchestrator failed to start${NC}"
    cat .claude/activity/orchestrator.log
fi

if ps -p $WATCHER_PID > /dev/null; then
    echo "${GREEN}✓ File Watcher is running${NC}"
else
    echo "${YELLOW}✗ File Watcher failed to start${NC}"
    cat .claude/activity/watcher.log
fi

echo ""
echo "${BLUE}Ready to go! Make a commit and watch the orchestration flow:${NC}"
echo ""
echo "  git add ."
echo "  git commit -m 'test: orchestration'"
echo ""
