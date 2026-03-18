import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('CLI arg parsing', () => {
  it('parses bare command', () => {
    const result = parseArgs(['claude']);
    expect(result.command).toBe('claude');
    expect(result.args).toEqual([]);
  });

  it('parses command with title', () => {
    const result = parseArgs(['--title', 'Building auth', 'claude']);
    expect(result.command).toBe('claude');
    expect(result.title).toBe('Building auth');
  });

  it('parses -- separated command with args', () => {
    const result = parseArgs(['--', 'aider', '--model', 'sonnet']);
    expect(result.command).toBe('aider');
    expect(result.args).toEqual(['--model', 'sonnet']);
  });

  it('parses subcommands: login, logout, whoami', () => {
    expect(parseArgs(['login']).subcommand).toBe('login');
    expect(parseArgs(['logout']).subcommand).toBe('logout');
    expect(parseArgs(['whoami']).subcommand).toBe('whoami');
  });
});
