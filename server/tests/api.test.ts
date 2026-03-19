import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createApiRouter } from '../src/api.js';
import { StreamManager } from '../src/stream-manager.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = () => {};
  ws.close = () => {};
  ws.readyState = 1;
  return ws;
}

async function request(app: express.Express, path: string, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      fetch(`http://localhost:${port}${path}`, { headers })
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        });
    });
  });
}

describe('API routes', () => {
  let app: express.Express;
  let mgr: StreamManager;

  beforeEach(() => {
    mgr = new StreamManager();
    app = express();
    app.use('/api', createApiRouter(mgr, null, 'test-secret'));
  });

  it('GET /api/streams returns empty when no streams', async () => {
    const { status, body } = await request(app, '/api/streams');
    expect(status).toBe(200);
    expect(body.streams).toEqual([]);
  });

  it('GET /api/streams returns live streams with viewer count', async () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const { body } = await request(app, '/api/streams');
    expect(body.streams).toHaveLength(1);
    expect(body.streams[0].id).toBe('s1');
    expect(body.streams[0].viewer_count).toBe(0);
  });

  it('GET /api/streams/:id returns stream details', async () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const { body } = await request(app, '/api/streams/s1');
    expect(body.id).toBe('s1');
    expect(body.title).toBe('test');
  });

  it('GET /api/streams/:id returns 404 for missing stream', async () => {
    const { status } = await request(app, '/api/streams/nonexistent');
    expect(status).toBe(404);
  });
});
