import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

export interface AistreamerConfig {
  token: string;
  user: {
    id: string;
    github_username: string;
    avatar_url: string;
  };
  server: string;
}

function configDir(): string {
  return path.join(os.homedir(), '.clawcast');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export function readConfig(): AistreamerConfig | null {
  try {
    const data = fs.readFileSync(configPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function writeConfig(config: AistreamerConfig): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configPath();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(configPath());
  } catch {}
}

export async function loginFlow(serverBaseUrl: string): Promise<AistreamerConfig> {
  const callbackPort = 9876;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${callbackPort}`);
      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const userId = url.searchParams.get('user_id');
        const username = url.searchParams.get('username');
        const avatar = url.searchParams.get('avatar_url') ?? '';

        if (!token || !userId || !username) {
          res.writeHead(400);
          res.end('Missing parameters');
          reject(new Error('OAuth callback missing parameters'));
          server.close();
          return;
        }

        const config: AistreamerConfig = {
          token,
          user: { id: userId, github_username: username, avatar_url: avatar },
          server: serverBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
        };

        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Logged in! You can close this tab.</h1></body></html>');
        server.close();
        resolve(config);
      }
    });

    server.on('error', (err) => {
      reject(new Error(`Could not start callback server on port ${callbackPort}: ${err.message}`));
    });

    server.listen(callbackPort, '127.0.0.1', async () => {
      const authUrl = `${serverBaseUrl}/auth/github?callback_port=${callbackPort}`;
      const { default: open } = await import('open');
      await open(authUrl);
      console.error(`\x1b[36m[clawcast]\x1b[0m Opening browser for GitHub login...`);
      console.error(`\x1b[36m[clawcast]\x1b[0m If the browser didn't open, visit: ${authUrl}`);
    });
  });
}
