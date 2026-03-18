import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeConfig, clearConfig, type AistreamerConfig } from '../src/auth.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Auth config', () => {
  let tmpDir: string;
  const origHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aistreamer-test-'));
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no config exists', () => {
    expect(readConfig()).toBeNull();
  });

  it('writes and reads config', () => {
    const config: AistreamerConfig = {
      token: 'test-jwt',
      user: { id: '123', github_username: 'em', avatar_url: '' },
      server: 'wss://aistreamer.dev',
    };
    writeConfig(config);
    const result = readConfig();
    expect(result).toEqual(config);
  });

  it('sets 0600 permissions on config file', () => {
    writeConfig({
      token: 'test',
      user: { id: '1', github_username: 'test', avatar_url: '' },
      server: 'wss://test',
    });
    const configPath = path.join(tmpDir, '.aistreamer', 'config.json');
    const stat = fs.statSync(configPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('clears config', () => {
    writeConfig({
      token: 'test',
      user: { id: '1', github_username: 'test', avatar_url: '' },
      server: 'wss://test',
    });
    clearConfig();
    expect(readConfig()).toBeNull();
  });
});
