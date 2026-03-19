import jwt from 'jsonwebtoken';
import { Router, type Request, type Response } from 'express';
import { config } from './config.js';
import { findOrCreateUser, type DbPool } from './db.js';
import { ulid } from 'ulid';

interface JwtPayload {
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

export function signJwt(payload: { sub: string; username: string }, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export function createAuthRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/github', (req: Request, res: Response) => {
    const callbackPort = req.query.callback_port as string;
    const state = Buffer.from(JSON.stringify({ callback_port: callbackPort })).toString('base64url');
    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&state=${state}&scope=read:user`;
    res.redirect(githubUrl);
  });

  router.get('/github/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = JSON.parse(Buffer.from(req.query.state as string, 'base64url').toString());
      const callbackPort = state.callback_port;

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code }),
      });
      const tokenData = await tokenRes.json() as { access_token: string };

      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const githubUser = await userRes.json() as { id: number; login: string; avatar_url: string };

      const user = await findOrCreateUser(pool, {
        id: ulid(), githubId: String(githubUser.id),
        username: githubUser.login, avatarUrl: githubUser.avatar_url,
      });

      const token = signJwt({ sub: user.id, username: user.username }, config.jwtSecret);
      const params = new URLSearchParams({
        token, user_id: user.id, username: user.username, avatar_url: user.avatar_url,
      });
      res.redirect(`http://localhost:${callbackPort}/callback?${params}`);
    } catch (err) {
      console.error('[aistreamer] OAuth error:', err);
      try {
        const state = JSON.parse(Buffer.from(req.query.state as string, 'base64url').toString());
        res.redirect(`http://localhost:${state.callback_port}/callback?error=oauth_failed`);
      } catch {
        res.status(500).send('OAuth failed');
      }
    }
  });

  return router;
}
