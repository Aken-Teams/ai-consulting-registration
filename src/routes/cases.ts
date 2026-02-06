import { Router } from 'express';
import { db } from '../db/index.js';
import { cases, leads } from '../db/schema.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { interviewScheduled } from '../lib/email-templates.js';
import { updateCaseSchema } from '../lib/validators.js';

const router = Router();
router.use(requireAuth);

// GET /api/cases
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const conditions = status ? and(eq(cases.status, status as any)) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(cases)
        .leftJoin(leads, eq(cases.leadId, leads.id))
        .where(conditions)
        .orderBy(desc(cases.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(conditions),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({
      success: true,
      data: data.map(row => ({ ...row.cases, lead: row.leads })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('List cases error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const result = await db.query.cases.findFirst({
      where: eq(cases.id, id),
      with: {
        lead: true,
        sessions: true,
        prdVersions: { orderBy: (pv, { desc }) => [desc(pv.versionNumber)] },
      },
    });

    if (!result) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Get case error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// PATCH /api/cases/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const result = updateCaseSchema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      res.status(400).json({ success: false, message: messages.join('；') });
      return;
    }

    const { status, consultantId, scheduledAt, title } = result.data;
    const updates: Record<string, unknown> = {};

    if (status) updates.status = status;
    if (consultantId !== undefined) updates.consultantId = consultantId;
    if (scheduledAt) updates.scheduledAt = new Date(scheduledAt);
    if (title) updates.title = title;

    const [updated] = await db
      .update(cases)
      .set(updates)
      .where(eq(cases.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }

    // Send schedule notification if scheduledAt was set
    if (scheduledAt && status === 'scheduled') {
      const [lead] = await db.select().from(leads).where(eq(leads.id, updated.leadId)).limit(1);
      if (lead) {
        const emailData = interviewScheduled({
          contactName: lead.contactName,
          company: lead.company,
          scheduledAt,
        });
        sendEmail({ to: lead.email, ...emailData }).catch(() => {});
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update case error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// DELETE /api/cases/:id — soft delete (set status to 'closed')
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const [updated] = await db
      .update(cases)
      .set({ status: 'closed', completedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }

    res.json({ success: true, message: '案件已關閉' });
  } catch (err) {
    console.error('Delete case error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
