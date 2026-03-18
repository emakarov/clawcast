import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ClaudeCodeAdapter', () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aistreamer-cc-test-'));
    adapter = new ClaudeCodeAdapter();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs hooks into settings.local.json', async () => {
    const settingsDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });

    const cleanup = await adapter.install('/tmp/test.sock', settingsDir);

    const settingsPath = path.join(settingsDir, 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.Notification).toBeDefined();

    await cleanup();

    // After cleanup, hooks should be removed
    if (fs.existsSync(settingsPath)) {
      const cleaned = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hasAistreamerHooks = JSON.stringify(cleaned).includes('aistreamer');
      expect(hasAistreamerHooks).toBe(false);
    }
  });

  it('preserves existing settings during install', async () => {
    const settingsDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.local.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ existing: true }));

    const cleanup = await adapter.install('/tmp/test.sock', settingsDir);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.existing).toBe(true);
    expect(settings.hooks).toBeDefined();

    await cleanup();

    const cleaned = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(cleaned.existing).toBe(true);
  });
});
