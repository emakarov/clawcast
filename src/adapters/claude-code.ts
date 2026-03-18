import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Adapter } from './base.js';

const HOOK_TAG = 'aistreamer-hook';

export class ClaudeCodeAdapter implements Adapter {
  readonly agentName = 'claude-code';

  /** Remove hooks left behind by crashed aistreamer sessions */
  static cleanupStaleHooks(settingsDir?: string): void {
    const dir = settingsDir ?? path.join(process.cwd(), '.claude');
    const settingsPath = path.join(dir, 'settings.local.json');
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (!settings.hooks) return;
      let changed = false;
      for (const hookType of ['PreToolUse', 'PostToolUse', 'Notification']) {
        const hooks = settings.hooks[hookType];
        if (!Array.isArray(hooks)) continue;
        settings.hooks[hookType] = hooks.filter((h: Record<string, unknown>) => {
          if (h.type !== HOOK_TAG) return true;
          const match = String(h.command).match(/aistreamer-(\d+)\.sock/);
          if (!match) return false;
          const pid = parseInt(match[1], 10);
          try { process.kill(pid, 0); return true; } catch { changed = true; return false; }
        });
      }
      if (changed) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    } catch {}
  }

  async install(socketPath: string, settingsDir?: string): Promise<() => Promise<void>> {
    const dir = settingsDir ?? path.join(process.cwd(), '.claude');
    const settingsPath = path.join(dir, 'settings.local.json');
    const hookScriptPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../hooks/claude-hook.js'
    );

    // Read existing settings
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {}

    // Save original for restoration
    const originalContent = fs.existsSync(settingsPath)
      ? fs.readFileSync(settingsPath, 'utf-8')
      : null;

    // Build hook entries
    const hookEntry = {
      type: HOOK_TAG,
      command: `AISTREAMER_SOCK=${socketPath} node ${hookScriptPath}`,
    };

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    hooks.PreToolUse = [...(hooks.PreToolUse ?? []), hookEntry];
    hooks.PostToolUse = [...(hooks.PostToolUse ?? []), hookEntry];
    hooks.Notification = [...(hooks.Notification ?? []), hookEntry];
    settings.hooks = hooks;

    // Write updated settings
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Return cleanup function
    return async () => {
      try {
        if (originalContent === null) {
          fs.unlinkSync(settingsPath);
        } else {
          fs.writeFileSync(settingsPath, originalContent);
        }
      } catch {}
    };
  }
}
