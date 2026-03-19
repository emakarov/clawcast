import { Router, type Request, type Response } from 'express';
import { StreamManager } from './stream-manager.js';
import { verifyJwt, extractBearerToken } from './auth.js';
import { getStream as dbGetStream, type DbPool } from './db.js';

export function createApiRouter(mgr: StreamManager, pool: DbPool | null, jwtSecret: string): Router {
  const router = Router();

  router.get('/streams', async (_req: Request, res: Response) => {
    const active = mgr.getActiveStreams().slice(0, 50);
    const streams = active.map((s) => ({
      id: s.metadata.id,
      title: s.metadata.title,
      agent: s.metadata.agent,
      status: 'live',
      user: { id: s.metadata.userId, username: s.metadata.username, avatar_url: s.metadata.avatarUrl },
      started_at: s.metadata.startedAt.toISOString(),
      viewer_count: s.viewers.size,
    }));
    res.json({ streams });
  });

  router.get('/streams/:id', async (req: Request<{ id: string }>, res: Response) => {
    const stream = mgr.getStream(req.params.id);
    if (stream) {
      res.json({
        id: stream.metadata.id,
        title: stream.metadata.title,
        agent: stream.metadata.agent,
        status: 'live',
        user: { id: stream.metadata.userId, username: stream.metadata.username, avatar_url: stream.metadata.avatarUrl },
        started_at: stream.metadata.startedAt.toISOString(),
        viewer_count: stream.viewers.size,
      });
      return;
    }

    if (pool) {
      const dbStream = await dbGetStream(pool, req.params.id);
      if (dbStream) { res.json(dbStream); return; }
    }

    res.status(404).json({ error: 'Stream not found' });
  });

  router.get('/me', async (req: Request, res: Response) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

    try {
      const payload = verifyJwt(token, jwtSecret);
      let avatarUrl = '';
      if (pool) {
        const result = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [payload.sub]);
        if (result.rows[0]) avatarUrl = result.rows[0].avatar_url || '';
      }
      res.json({ id: payload.sub, username: payload.username, avatar_url: avatarUrl });
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
}
