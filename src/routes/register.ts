import { Router } from 'express';
import { db } from '../db/index.js';
import { leads, cases, notifications, users } from '../db/schema.js';
import { desc, eq, sql } from 'drizzle-orm';
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

    // Check for duplicate email
    const [existing] = await db.select({ id: leads.id, company: leads.company })
      .from(leads)
      .where(eq(leads.email, data.email.trim()))
      .limit(1);

    const isDuplicate = !!existing;

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
      source: data.source?.trim() || null,
      utmSource: data.utmSource?.trim() || null,
      utmMedium: data.utmMedium?.trim() || null,
      utmCampaign: data.utmCampaign?.trim() || null,
      referrer: data.referrer?.trim() || null,
      voiceIntakeData: data.voiceIntakeData || null,
    }).returning();

    // Auto-create a case for this lead
    await db.insert(cases).values({
      leadId: lead.id,
      status: 'new',
      title: `${lead.company} — AI 輔能諮詢`,
    });

    // Notify all admin users about new lead (async)
    db.select({ id: users.id }).from(users).where(eq(users.isActive, true)).then(adminUsers => {
      for (const u of adminUsers) {
        db.insert(notifications).values({
          userId: u.id,
          type: 'new_lead',
          title: '新報名',
          message: `${lead.company} — ${lead.contactName} 提交了諮詢報名`,
          link: `/admin`,
        }).catch(() => {});
      }
    }).catch(() => {});

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
      data: { id: lead.id, isDuplicate },
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

// GET /api/registrations/duplicates — find leads with same email
router.get('/duplicates', requireAuth, async (_req, res) => {
  try {
    const dupes = await db
      .select({
        email: leads.email,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .groupBy(leads.email)
      .having(sql`count(*) > 1`);

    res.json({ success: true, data: dupes });
  } catch (err) {
    console.error('Duplicates check error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/registrations/bulk-email — send email to selected leads
router.post('/bulk-email', requireAuth, async (req, res) => {
  try {
    const { leadIds, subject, body } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({ success: false, message: '請選擇至少一位收件者' });
      return;
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      res.status(400).json({ success: false, message: '請輸入郵件主旨' });
      return;
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ success: false, message: '請輸入郵件內容' });
      return;
    }

    // Get lead emails
    const allLeads = await db.select({ id: leads.id, email: leads.email, contactName: leads.contactName })
      .from(leads);
    const targetLeads = allLeads.filter(l => leadIds.includes(l.id));

    if (targetLeads.length === 0) {
      res.status(400).json({ success: false, message: '找不到符合的報名者' });
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const lead of targetLeads) {
      const personalBody = body.replace(/\{\{name\}\}/g, lead.contactName);
      const ok = await sendEmail({
        to: lead.email,
        subject: subject.trim(),
        html: `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"></head><body style="font-family:'Noto Sans TC',sans-serif;line-height:1.8;color:#334155;max-width:600px;margin:0 auto;padding:24px;">${personalBody}</body></html>`,
      });
      if (ok) sent++;
      else failed++;
    }

    res.json({ success: true, data: { sent, failed, total: targetLeads.length } });
  } catch (err) {
    console.error('Bulk email error:', err);
    res.status(500).json({ success: false, message: '發送失敗' });
  }
});

export default router;
