// server/src/config.ts
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/aistreamer',
  clickhouseUrl: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
  r2: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    endpoint: process.env.R2_ENDPOINT || '',
    bucketRecordings: process.env.R2_BUCKET_RECORDINGS || 'clawcast-recordings',
    prefix: process.env.R2_PREFIX || 'dev',
  },
};
