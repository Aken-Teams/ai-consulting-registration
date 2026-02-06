import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';

import authRouter from './routes/auth.js';
import registerRouter from './routes/register.js';
import casesRouter from './routes/cases.js';
import sessionsRouter from './routes/sessions.js';
import prdRouter from './routes/prd.js';
import { setupSocketIO } from './socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
setupSocketIO(io);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(join(ROOT, 'public')));
app.use('/dist', express.static(join(ROOT, 'dist')));

// --- API Routes ---
app.use('/api/auth', authRouter);
app.use('/api/register', registerRouter);
app.use('/api/registrations', registerRouter);
app.use('/api/cases', casesRouter);
app.use('/api/cases', sessionsRouter);  // /api/cases/:caseId/sessions
app.use('/api/sessions', sessionsRouter);  // /api/sessions/:id
app.use('/api/cases', prdRouter);  // /api/cases/:caseId/prd/*

// Admin SPA
app.get('/admin/*', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'admin.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'admin.html'));
});

// Landing page SPA fallback
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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
