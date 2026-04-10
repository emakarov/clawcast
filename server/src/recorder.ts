import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { config } from './config.js';

const RECORDINGS_DIR = path.join(os.tmpdir(), 'clawcast-recordings');

interface RecordingSession {
  streamId: string;
  username: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  cols: number;
  rows: number;
  bytes: number;
}

const MAX_RECORDING_BYTES = 500 * 1024 * 1024; // 500 MB uncompressed

const sessions = new Map<string, RecordingSession>();

export function startRecording(
  streamId: string,
  username: string,
  cols: number,
  rows: number,
): void {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const filePath = path.join(RECORDINGS_DIR, `${streamId}.cast`);
  const writeStream = fs.createWriteStream(filePath, { flags: 'w' });

  // asciicast v2 header
  const header = JSON.stringify({
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(Date.now() / 1000),
    env: { TERM: 'xterm-256color' },
  });
  writeStream.write(header + '\n');

  sessions.set(streamId, {
    streamId,
    username,
    filePath,
    writeStream,
    startTime: Date.now(),
    cols,
    rows,
    bytes: 0,
  });
}

export function recordChunk(streamId: string, data: Buffer): void {
  const session = sessions.get(streamId);
  if (!session) return;
  if (session.bytes > MAX_RECORDING_BYTES) return;

  const elapsed = (Date.now() - session.startTime) / 1000;
  const line = JSON.stringify([elapsed, 'o', data.toString('base64')]);
  session.writeStream.write(line + '\n');
  session.bytes += data.length;
}

export function recordResize(streamId: string, cols: number, rows: number): void {
  const session = sessions.get(streamId);
  if (!session) return;

  const elapsed = (Date.now() - session.startTime) / 1000;
  const line = JSON.stringify([elapsed, 'r', `${cols}x${rows}`]);
  session.writeStream.write(line + '\n');
  session.cols = cols;
  session.rows = rows;
}

export async function stopRecording(streamId: string): Promise<string | null> {
  const session = sessions.get(streamId);
  if (!session) return null;

  // Close the write stream
  await new Promise<void>((resolve) => {
    session.writeStream.end(() => resolve());
  });

  sessions.delete(streamId);

  // Compress
  const gzPath = session.filePath + '.gz';
  try {
    const source = fs.createReadStream(session.filePath);
    const dest = fs.createWriteStream(gzPath);
    const gzip = createGzip({ level: 6 });
    await pipeline(source, gzip, dest);
  } catch (err) {
    console.error(`[clawcast] Failed to compress recording ${streamId}:`, err);
    cleanup(session.filePath, gzPath);
    return null;
  }

  // Upload to R2 via rclone
  const r2Key = `${config.r2.prefix}/${session.username}/${streamId}.cast.gz`;
  const r2Dest = `r2:${config.r2.bucketRecordings}/${r2Key}`;

  try {
    await rclone('copyto', gzPath, r2Dest);
    const stats = fs.statSync(gzPath);
    console.log(`[clawcast] Recording uploaded: ${r2Key} (${(stats.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`[clawcast] Failed to upload recording ${streamId}:`, err);
    cleanup(session.filePath, gzPath);
    return null;
  }

  // Cleanup local files
  cleanup(session.filePath, gzPath);
  return r2Key;
}

function rclone(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('rclone', args, { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

function cleanup(...files: string[]): void {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}
