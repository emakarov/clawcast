#!/usr/bin/env node
/**
 * Development CLI wrapper — identical to clawcast but defaults to localhost:3456.
 * Usage: clawcast-dev login
 *        clawcast-dev --title "Test" -- claude
 */
import process from 'node:process';

// Inject --server if not already provided
const args = process.argv.slice(2);
if (!args.includes('--server')) {
  args.push('--server', 'http://localhost:3456');
}

// Re-set argv and run main CLI
process.argv = [process.argv[0], process.argv[1], ...args];
await import('./cli.js');
