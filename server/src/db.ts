// server/src/db.ts
import pg from 'pg';

export type DbPool = pg.Pool;

export function createPool(connectionString: string): DbPool {
  return new pg.Pool({ connectionString });
}

export async function ensureSchema(pool: DbPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          text PRIMARY KEY,
      github_id   text UNIQUE NOT NULL,
      username    text NOT NULL,
      avatar_url  text,
      created_at  timestamptz DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS streams (
      id          text PRIMARY KEY,
      user_id     text REFERENCES users(id),
      title       text DEFAULT '',
      agent       text DEFAULT 'unknown',
      status      text DEFAULT 'live',
      started_at  timestamptz DEFAULT now(),
      ended_at    timestamptz,
      cols        int DEFAULT 80,
      rows        int DEFAULT 24
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id)`);
}

export async function createStream(pool: DbPool, stream: {
  id: string; userId: string; title: string; agent: string; cols: number; rows: number;
}): Promise<void> {
  await pool.query(
    'INSERT INTO streams (id, user_id, title, agent, cols, rows) VALUES ($1, $2, $3, $4, $5, $6)',
    [stream.id, stream.userId, stream.title, stream.agent, stream.cols, stream.rows]
  );
}

export async function endStream(pool: DbPool, streamId: string): Promise<void> {
  await pool.query("UPDATE streams SET status = 'ended', ended_at = now() WHERE id = $1", [streamId]);
}

export async function endUserStreams(pool: DbPool, userId: string): Promise<string[]> {
  const result = await pool.query(
    "UPDATE streams SET status = 'ended', ended_at = now() WHERE user_id = $1 AND status = 'live' RETURNING id",
    [userId]
  );
  return result.rows.map((r: { id: string }) => r.id);
}

export async function getLiveStreams(pool: DbPool, limit = 50): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT s.id, s.title, s.agent, s.status, s.started_at, s.cols, s.rows,
            u.id as user_id, u.username, u.avatar_url
     FROM streams s JOIN users u ON s.user_id = u.id
     WHERE s.status = 'live' ORDER BY s.started_at DESC LIMIT $1`, [limit]
  );
  return result.rows;
}

export async function getStream(pool: DbPool, streamId: string): Promise<unknown | null> {
  const result = await pool.query(
    `SELECT s.id, s.title, s.agent, s.status, s.started_at, s.ended_at, s.cols, s.rows,
            u.id as user_id, u.username, u.avatar_url
     FROM streams s JOIN users u ON s.user_id = u.id WHERE s.id = $1`, [streamId]
  );
  return result.rows[0] || null;
}

export async function findOrCreateUser(pool: DbPool, user: {
  id: string; githubId: string; username: string; avatarUrl: string;
}): Promise<{ id: string; username: string; avatar_url: string }> {
  const existing = await pool.query('SELECT id, username, avatar_url FROM users WHERE github_id = $1', [user.githubId]);
  if (existing.rows.length > 0) {
    await pool.query('UPDATE users SET username = $1, avatar_url = $2 WHERE github_id = $3', [user.username, user.avatarUrl, user.githubId]);
    return { ...existing.rows[0], username: user.username, avatar_url: user.avatarUrl };
  }
  await pool.query('INSERT INTO users (id, github_id, username, avatar_url) VALUES ($1, $2, $3, $4)',
    [user.id, user.githubId, user.username, user.avatarUrl]);
  return { id: user.id, username: user.username, avatar_url: user.avatarUrl };
}
