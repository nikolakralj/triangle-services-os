#!/bin/bash

# Real-time agent coordination monitor
# Usage: bash watch-agents.sh

echo "🤖 Agent Coordination Monitor"
echo "=============================="
echo "Watching: task-queue.json, orchestrator.log, codex.log, antigravity.log"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Create a function to display current state
show_state() {
    clear
    echo "📊 CURRENT AGENT STATE - $(date)"
    echo "=================================="
    echo ""
    
    if [ -f ".claude/orchestration/task-queue.json" ]; then
        echo "📋 Task Queue Status:"
        cat .claude/orchestration/task-queue.json | grep -E '"(last_trigger|action|status|last_action|next_agent)"' | head -10
        echo ""
    fi
    
    if [ -f ".claude/activity/orchestrator.log" ]; then
        echo "🔄 Last Orchestrator Activity:"
        tail -3 .claude/activity/orchestrator.log
        echo ""
    fi
    
    if [ -f ".claude/activity/codex.log" ]; then
        echo "🎨 Last Codex Activity:"
        tail -2 .claude/activity/codex.log
        echo ""
    fi
    
    if [ -f ".claude/activity/antigravity.log" ]; then
        echo "🧪 Last Antigravity Activity:"
        tail -3 .claude/activity/antigravity.log
    fi
}

# Initial display
show_state

# Watch files for changes and refresh every 2 seconds
while true; do
    sleep 2
    show_state
done
