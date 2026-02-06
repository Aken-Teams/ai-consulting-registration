import { Router } from 'express';
import { db } from '../db/index.js';
import { leads, cases } from '../db/schema.js';
import { desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { registrationConfirmation } from '../lib/email-templates.js';
import { registerSchema } from '../lib/validators.js';

const router = Router();

// POST /api/register — public
router.post('/', async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      res.status(422).json({ success: false, message: messages.join('；') });
      return;
    }

    const data = result.data;

    const [lead] = await db.insert(leads).values({
      company: data.company.trim(),
      contactName: data.contactName.trim(),
      title: data.title?.trim() || null,
      email: data.email.trim(),
      phone: data.phone.trim(),
      companySize: data.companySize,
      needTypes: data.needTypes,
      description: data.description?.trim() || null,
      industry: data.industry?.trim() || null,
      painPoints: data.painPoints?.trim() || null,
      expectedOutcome: data.expectedOutcome?.trim() || null,
      existingTools: data.existingTools?.trim() || null,
      preferredTimeslots: data.preferredTimeslots && data.preferredTimeslots.length > 0 ? data.preferredTimeslots : null,
    }).returning();

    // Auto-create a case for this lead
    await db.insert(cases).values({
      leadId: lead.id,
      status: 'new',
      title: `${lead.company} — AI 輔能諮詢`,
    });

    // Send confirmation email (async, don't block response)
    const emailData = registrationConfirmation({
      contactName: lead.contactName,
      company: lead.company,
      needTypes: lead.needTypes,
    });
    sendEmail({ to: lead.email, ...emailData }).catch(() => {});

    res.status(201).json({
      success: true,
      message: '報名成功！我們將盡快與您聯繫安排訪談。',
      data: { id: lead.id },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤，請稍後再試。' });
  }
});

// GET /api/registrations — protected
router.get('/', requireAuth, async (_req, res) => {
  try {
    const list = await db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt));

    res.json({ success: true, data: list });
  } catch (err) {
    console.error('Read registrations error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
