import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';
import { createPool, ensureSchema, endStream as dbEndStream, type DbPool } from './db.js';
import { createClickHouseLogger, ensureClickHouseSchema, EventLogger } from './clickhouse.js';
import { createAuthRouter, verifyJwt, extractBearerToken } from './auth.js';
import { createApiRouter } from './api.js';
import { StreamManager } from './stream-manager.js';
import { handleBroadcasterMessage } from './ws-broadcaster.js';
import { handleViewerConnection } from './ws-viewer.js';
import { startHeartbeat } from './heartbeat.js';

async function main() {
  // Database setup
  const pool: DbPool = createPool(config.databaseUrl);
  await ensureSchema(pool);

  // ClickHouse setup
  let logger: EventLogger;
  try {
    await ensureClickHouseSchema(config.clickhouseUrl);
    logger = createClickHouseLogger(config.clickhouseUrl);
  } catch (err) {
    console.warn('[aistreamer] ClickHouse not available, events will not be logged:', err);
    logger = new EventLogger();
  }

  const mgr = new StreamManager();

  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use('/auth', createAuthRouter(pool));
  app.use('/api', createApiRouter(mgr, pool, config.jwtSecret));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);

  const broadcasterWss = new WebSocketServer({ noServer: true });
  const viewerWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (url.pathname === '/stream') {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let userId: string;
      let username: string;
      try {
        const payload = verifyJwt(token, config.jwtSecret);
        userId = payload.sub;
        username = payload.username;
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      broadcasterWss.handleUpgrade(req, socket, head, (ws) => {
        broadcasterWss.emit('connection', ws, req, userId, username);
      });
    } else if (url.pathname.startsWith('/watch/')) {
      const streamId = url.pathname.slice('/watch/'.length);
      viewerWss.handleUpgrade(req, socket, head, (ws) => {
        viewerWss.emit('connection', ws, req, streamId);
      });
    } else {
      socket.destroy();
    }
  });

  broadcasterWss.on('connection', (ws: WebSocket, _req: any, userId: string, username: string) => {
    let currentStreamId: string | null = null;
    const stopHeartbeat = startHeartbeat(ws, () => {
      if (currentStreamId) {
        mgr.endStream(currentStreamId);
        dbEndStream(pool, currentStreamId).catch(() => {});
      }
      ws.terminate();
    });

    ws.on('message', async (data: Buffer) => {
      currentStreamId = await handleBroadcasterMessage(
        ws, mgr, logger, userId, username, '', data.toString(), currentStreamId, pool
      );
    });

    ws.on('close', async () => {
      stopHeartbeat();
      if (currentStreamId) {
        mgr.endStream(currentStreamId);
        try { await dbEndStream(pool, currentStreamId); } catch {}
      }
    });

    ws.on('error', () => {});
  });

  viewerWss.on('connection', (ws: WebSocket, _req: any, streamId: string) => {
    const stopHeartbeat = startHeartbeat(ws, () => {
      mgr.removeViewer(streamId, ws);
      ws.terminate();
    });

    handleViewerConnection(ws, streamId, mgr);

    ws.on('close', () => stopHeartbeat());
    ws.on('error', () => {});
  });

  server.listen(config.port, () => {
    console.log(`[aistreamer] Server running on port ${config.port}`);
  });

  const shutdown = async () => {
    console.log('[aistreamer] Shutting down...');
    const endedIds = mgr.endAll();
    for (const id of endedIds) {
      try { await dbEndStream(pool, id); } catch {}
    }
    broadcasterWss.close();
    viewerWss.close();
    await logger.close();
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[aistreamer] Fatal:', err);
  process.exit(1);
});
