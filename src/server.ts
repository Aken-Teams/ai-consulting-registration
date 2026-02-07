import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
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
import { db } from './db/index.js';
import { sql, eq, desc } from 'drizzle-orm';
import { prdVersions, cases, leads, pageViews } from './db/schema.js';
import { verifyShareToken, generateShareToken } from './lib/auth.js';

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

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline scripts for SPA
  crossOriginEmbedderPolicy: false,
}));

// Gzip compression
app.use(compression());

// Rate limiting — public API
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 50,
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting — auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: '登入嘗試過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(join(ROOT, 'public')));
app.use('/dist', express.static(join(ROOT, 'dist')));

// --- Health Check ---
app.get('/api/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// --- Page View Tracking (public) ---
app.post('/api/track', publicLimiter, async (req, res) => {
  try {
    const { path } = req.body;
    if (!path || typeof path !== 'string') {
      res.json({ success: true }); // Fail silently
      return;
    }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const referrer = (req.headers.referer || '').slice(0, 1000);
    db.insert(pageViews).values({ path: path.slice(0, 500), referrer: referrer || null, userAgent: userAgent || null, ip: ip || null }).catch(() => {});
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // Never fail tracking
  }
});

// --- API Routes ---
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/register', publicLimiter, registerRouter);
app.use('/api/registrations', registerRouter);
app.use('/api/cases', casesRouter);
app.use('/api/cases', sessionsRouter);  // /api/cases/:caseId/sessions
app.use('/api/sessions', sessionsRouter);  // /api/sessions/:id
app.use('/api/cases', prdRouter);  // /api/cases/:caseId/prd/*

// --- Public PRD Preview API ---
app.get('/api/prd-preview/:caseId', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    const token = req.query.token as string;
    if (isNaN(caseId) || !token || !verifyShareToken(token, caseId)) {
      res.status(403).json({ success: false, message: '無效的預覽連結' });
      return;
    }

    const [prd] = await db.select().from(prdVersions)
      .where(eq(prdVersions.caseId, caseId))
      .orderBy(desc(prdVersions.versionNumber))
      .limit(1);

    if (!prd) {
      res.status(404).json({ success: false, message: '找不到 PRD' });
      return;
    }

    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    const [lead] = caseRow
      ? await db.select().from(leads).where(eq(leads.id, caseRow.leadId)).limit(1)
      : [null];

    res.json({
      success: true,
      data: {
        company: lead?.company || '未知公司',
        title: caseRow?.title || '',
        versionNumber: prd.versionNumber,
        isLocked: prd.isLocked,
        sections: prd.content.sections,
        completeness: (prd.content as any).metadata?.completeness || 0,
        updatedAt: prd.updatedAt,
      },
    });
  } catch (err) {
    console.error('PRD preview error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// Generate share link (auth required)
app.get('/api/cases/:caseId/share-link', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '未授權' });
    return;
  }
  const caseId = parseInt(req.params.caseId);
  if (isNaN(caseId)) {
    res.status(400).json({ success: false, message: '無效的案件 ID' });
    return;
  }
  const token = generateShareToken(caseId);
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const shareUrl = `${protocol}://${host}/prd-preview/${caseId}?token=${token}`;
  res.json({ success: true, data: { shareUrl, token } });
});

// Admin SPA
app.get('/admin/*', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'admin.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'admin.html'));
});

// PRD Preview public page
app.get('/prd-preview/:caseId', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'prd-preview.html'));
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
