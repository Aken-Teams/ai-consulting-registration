import { Router } from 'express';
import { db } from '../db/index.js';
import { leads, cases } from '../db/schema.js';
import { desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { registrationConfirmation } from '../lib/email-templates.js';

const router = Router();

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  return /^[\d\-+() ]{7,20}$/.test(phone);
}

// POST /api/register — public
router.post('/', async (req, res) => {
  try {
    const { company, contactName, title, email, phone, companySize, needTypes, description,
      industry, painPoints, expectedOutcome, existingTools, preferredTimeslots } = req.body;

    const errors: string[] = [];
    if (!company || typeof company !== 'string' || company.trim().length < 1) {
      errors.push('請填寫公司名稱');
    }
    if (!contactName || typeof contactName !== 'string' || contactName.trim().length < 1) {
      errors.push('請填寫聯絡人姓名');
    }
    if (!email || typeof email !== 'string' || !validateEmail(email.trim())) {
      errors.push('請填寫有效的 Email');
    }
    if (!phone || typeof phone !== 'string' || !validatePhone(phone.trim())) {
      errors.push('請填寫有效的電話號碼');
    }
    if (!companySize || typeof companySize !== 'string') {
      errors.push('請選擇公司規模');
    }
    if (!Array.isArray(needTypes) || needTypes.length === 0) {
      errors.push('請至少選擇一項需求類型');
    }

    if (errors.length > 0) {
      res.status(422).json({ success: false, message: errors.join('；') });
      return;
    }

    const [lead] = await db.insert(leads).values({
      company: company.trim(),
      contactName: contactName.trim(),
      title: (title || '').trim() || null,
      email: email.trim(),
      phone: phone.trim(),
      companySize,
      needTypes,
      description: (description || '').trim() || null,
      industry: (industry || '').trim() || null,
      painPoints: (painPoints || '').trim() || null,
      expectedOutcome: (expectedOutcome || '').trim() || null,
      existingTools: (existingTools || '').trim() || null,
      preferredTimeslots: Array.isArray(preferredTimeslots) && preferredTimeslots.length > 0 ? preferredTimeslots : null,
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
