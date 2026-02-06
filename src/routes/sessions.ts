import { Router } from 'express';
import { db } from '../db/index.js';
import { sessions, transcripts, cases } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// POST /api/cases/:caseId/sessions — create new interview session
router.post('/:caseId/sessions', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    // Verify case exists
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!caseRow) {
      res.status(404).json({ success: false, message: '找不到案件' });
      return;
    }

    // Update case status
    await db.update(cases).set({ status: 'interviewing' }).where(eq(cases.id, caseId));

    const [session] = await db.insert(sessions).values({
      caseId,
    }).returning();

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的 session ID' });
      return;
    }

    const result = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
      with: { transcripts: { orderBy: (t, { asc }) => [asc(t.sequenceNumber)] } },
    });

    if (!result) {
      res.status(404).json({ success: false, message: '找不到訪談' });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// PATCH /api/sessions/:id — end session
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的 session ID' });
      return;
    }

    const now = new Date();
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) {
      res.status(404).json({ success: false, message: '找不到訪談' });
      return;
    }

    const durationSeconds = Math.round((now.getTime() - session.startedAt.getTime()) / 1000);

    const [updated] = await db.update(sessions)
      .set({ endedAt: now, durationSeconds })
      .where(eq(sessions.id, id))
      .returning();

    // Update case status
    await db.update(cases).set({ status: 'pending_review' }).where(eq(cases.id, session.caseId));

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
