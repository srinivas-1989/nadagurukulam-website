---
name: dynamic-tools-management
description: Dynamic tool management and context compression strategy for Claude use
metadata:
  type: project
---

Dynamic Tool Management System for Claude

## Strategy Overview
Disable tools by default and enable them dynamically when needed. Use compression for exploration and full execution only when required.

## Current Plugin Status (Enabled/Disabled by Default)

**Disabled (Compressed Mode Only):**
- `anthropic-skills:investigate-first` - Use for code exploration
- `anthropic-skills:cavecrew` - Use for 1-2 file edits
- `anthropic-skills:pdf`, `pptx`, `xlsx`, `docx` - Enable only for document work
- `anthropic-skills:frontend-design` - Enable only for UI work

**Already Disabled:**
- `vercel@claude-plugins-official` - Major context consumer (686 uses, 150+ schemas)

## Tool Usage Pattern

### 1. Exploration Phase (Use Compressed Tools)
- Use `cavecrew-investigator` to locate files without full reads
- Use `cavecrew-builder` for 1-2 file edits with compressed output
- Use `cavecrew-reviewer` for diff reviews without full context

### 2. Execution Phase (Use Full Tools When Required)
- Enable specific plugins temporarily for complex operations
- Use `rtk` (Command Output) for compressed execution
- Use full tools only when exploration tools cannot accomplish the task

### 3. Context Monitoring
- Use `rtk status` to check current tool usage
- Use `rtk plugins` to view tool schema costs
- Use `rtk emergency-mode` if context limits are hit

## Implementation Commands

```bash
# Check available tools
rtk can-use <tool-name> <context-size>

# Enable a tool temporarily
rtk enable <tool-name> <duration>

# Compressed execution mode
rtk proxy <command>  # Only use when result is unusable

# Status check
rtk status

# Tool schema costs
rtk plugins
```

## Hook Configuration

Updated hooks now support:
- `rtk hook claude` for tool types (Bash, Agent, Read)
- Dynamic command routing based on tool type
- Context compression for exploration tools

## Recovery Procedures

If context limits are hit:
1. `rtk emergency-mode` - Switch to ultra-compressed mode
2. `rtk clear-schemas` - Clear tool schemas
3. `rtk reset-context` - Return to safe state

## Context Guidelines

- Default: All tools disabled (compressed mode)
- Exploration: Use cavecrew and investigate-first tools
- Complex operations: Temporarily enable specific plugins
- Execution: Use rtk for compressed full commands
- Review: Use cavecrew-reviewer for diff verification

## Memory Integration

Related memories:
- [[v100-plugin-management]] - For Vercel plugin specific fixes
- [[claude-settings-structure]] - For settings file structure