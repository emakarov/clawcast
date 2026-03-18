#!/usr/bin/env node
// src/hooks/claude-hook.js
// Installed as a Claude Code hook. Reads hook data from stdin,
// sends structured events to aistreamer CLI via Unix socket.

const net = require('net');
const socketPath = process.env.AISTREAMER_SOCK;

if (!socketPath) {
  process.exit(0);
}

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const events = [];

    if (hookData.hook_type === 'PreToolUse') {
      events.push({
        event: 'tool_start',
        tool: hookData.tool_name || 'unknown',
        ...(hookData.tool_input?.file_path ? { file: hookData.tool_input.file_path } : {}),
      });
    } else if (hookData.hook_type === 'PostToolUse') {
      events.push({
        event: 'tool_end',
        tool: hookData.tool_name || 'unknown',
        success: !hookData.error,
      });
      // Emit file_change for Edit/Write tools
      const tool = hookData.tool_name;
      if ((tool === 'Edit' || tool === 'Write') && hookData.tool_input?.file_path) {
        events.push({
          event: 'file_change',
          path: hookData.tool_input.file_path,
          action: tool === 'Edit' ? 'edit' : 'create',
        });
      }
    } else if (hookData.hook_type === 'Notification') {
      events.push({
        event: 'agent_message',
        role: hookData.role || 'assistant',
        summary: hookData.message || hookData.title || '',
      });
    }

    const client = net.createConnection(socketPath, () => {
      for (const event of events) {
        client.write(JSON.stringify(event) + '\n');
      }
      client.end();
    });

    client.on('error', () => {
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
});
