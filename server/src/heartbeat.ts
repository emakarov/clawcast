import type WebSocket from 'ws';

const PING_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;

export function startHeartbeat(ws: WebSocket, onDead: () => void): () => void {
  let alive = true;
  let pongTimeout: ReturnType<typeof setTimeout> | null = null;

  ws.on('pong', () => {
    alive = true;
    if (pongTimeout) { clearTimeout(pongTimeout); pongTimeout = null; }
  });

  const interval = setInterval(() => {
    if (!alive) { clearInterval(interval); if (pongTimeout) clearTimeout(pongTimeout); onDead(); return; }
    alive = false;
    ws.ping();
    pongTimeout = setTimeout(() => {
      if (!alive) { clearInterval(interval); onDead(); }
    }, PONG_TIMEOUT);
  }, PING_INTERVAL);

  return () => { clearInterval(interval); if (pongTimeout) clearTimeout(pongTimeout); };
}
