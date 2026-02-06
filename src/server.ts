import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './routes/auth.js';
import registerRouter from './routes/register.js';
import casesRouter from './routes/cases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(join(ROOT, 'public')));
app.use('/dist', express.static(join(ROOT, 'dist')));

// --- API Routes ---
app.use('/api/auth', authRouter);
app.use('/api/register', registerRouter);
app.use('/api/registrations', registerRouter);  // GET /api/registrations returns all leads
app.use('/api/cases', casesRouter);

// Admin page
app.get('/admin', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'admin.html'));
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'index.html'));
});

// Error handler
app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: '請求格式錯誤：無效的 JSON' });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ success: false, message: '伺服器錯誤' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
