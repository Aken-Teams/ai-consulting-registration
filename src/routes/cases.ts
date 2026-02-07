import { Router } from 'express';
import { db } from '../db/index.js';
import { cases, leads, sessions, transcripts, prdVersions, caseComments, caseStatusHistory, users, notifications } from '../db/schema.js';
import { eq, desc, sql, and, gte, lte, ilike, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { interviewScheduled } from '../lib/email-templates.js';
import { updateCaseSchema } from '../lib/validators.js';
import { computeLeadScore } from '../lib/lead-score.js';

const router = Router();
router.use(requireAuth);

// GET /api/cases
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.from as string | undefined;
    const dateTo = req.query.to as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const filters = [];
    if (status) filters.push(eq(cases.status, status as any));
    if (dateFrom) filters.push(gte(cases.createdAt, new Date(dateFrom)));
    if (dateTo) filters.push(lte(cases.createdAt, new Date(dateTo + 'T23:59:59Z')));
    if (search) {
      const q = `%${search}%`;
      filters.push(or(
        ilike(leads.company, q),
        ilike(leads.contactName, q),
        ilike(leads.email, q),
        ilike(cases.title, q),
      )!);
    }

    const conditions = filters.length > 0 ? and(...filters) : undefined;

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
        .leftJoin(leads, eq(cases.leadId, leads.id))
        .where(conditions),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({
      success: true,
      data: data.map(row => ({
        ...row.cases,
        lead: row.leads,
        leadScore: row.leads ? computeLeadScore(row.leads) : 0,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('List cases error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/cases/pin/:id — toggle pin (MUST be before /:id)
router.post('/pin/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }
    const [existing] = await db.select({ isPinned: cases.isPinned }).from(cases).where(eq(cases.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }
    const [updated] = await db.update(cases).set({ isPinned: !existing.isPinned }).where(eq(cases.id, id)).returning();
    res.json({ success: true, data: { isPinned: updated.isPinned } });
  } catch (err) {
    console.error('Pin toggle error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/cases/batch — bulk update cases (MUST be before /:id)
router.post('/batch', async (req, res) => {
  try {
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: '請選擇至少一個案件' });
      return;
    }
    if (!action) {
      res.status(400).json({ success: false, message: '請指定操作' });
      return;
    }

    const validStatuses = ['new', 'scheduled', 'interviewing', 'pending_review', 'prd_draft', 'prd_locked', 'mvp', 'closed'];
    const validPriorities = ['urgent', 'high', 'normal', 'low'];
    let updated = 0;

    if (action === 'status' && validStatuses.includes(value)) {
      const userId = (req as any).user?.userId;
      for (const id of ids) {
        const [current] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, id)).limit(1);
        const updates: Record<string, unknown> = { status: value };
        if (value === 'closed') updates.completedAt = new Date();
        await db.update(cases).set(updates).where(eq(cases.id, id));
        if (current && current.status !== value) {
          db.insert(caseStatusHistory).values({
            caseId: id, userId: userId || null,
            fromStatus: current.status as any, toStatus: value as any,
          }).catch(() => {});
        }
        updated++;
      }
    } else if (action === 'priority' && validPriorities.includes(value)) {
      for (const id of ids) {
        await db.update(cases).set({ priority: value as any }).where(eq(cases.id, id));
        updated++;
      }
    } else if (action === 'assign' && typeof value === 'number') {
      for (const id of ids) {
        await db.update(cases).set({ consultantId: value }).where(eq(cases.id, id));
        updated++;
      }
    } else {
      res.status(400).json({ success: false, message: '無效的操作' });
      return;
    }

    res.json({ success: true, data: { updated } });
  } catch (err) {
    console.error('Batch update error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/analytics — dashboard analytics (MUST be before /:id)
router.get('/analytics', async (_req, res) => {
  try {
    const sessionStats = await db
      .select({
        totalSessions: sql<number>`count(*)::int`,
        avgDuration: sql<number>`coalesce(avg(${sessions.durationSeconds}), 0)::int`,
        totalDuration: sql<number>`coalesce(sum(${sessions.durationSeconds}), 0)::int`,
      })
      .from(sessions);

    const messageStats = await db
      .select({
        totalMessages: sql<number>`count(*)::int`,
      })
      .from(transcripts);

    const prdStats = await db
      .select({
        totalPrds: sql<number>`count(*)::int`,
        lockedPrds: sql<number>`count(*) filter (where ${prdVersions.isLocked} = true)::int`,
      })
      .from(prdVersions);

    const funnel = await db
      .select({
        status: cases.status,
        count: sql<number>`count(*)::int`,
      })
      .from(cases)
      .groupBy(cases.status);

    const s = sessionStats[0];
    const m = messageStats[0];
    const p = prdStats[0];
    const avgMessagesPerSession = s.totalSessions > 0 ? Math.round(m.totalMessages / s.totalSessions) : 0;

    res.json({
      success: true,
      data: {
        totalSessions: s.totalSessions,
        avgSessionDuration: s.avgDuration,
        totalInterviewMinutes: Math.round(s.totalDuration / 60),
        totalMessages: m.totalMessages,
        avgMessagesPerSession,
        totalPrds: p.totalPrds,
        lockedPrds: p.lockedPrds,
        prdLockRate: p.totalPrds > 0 ? Math.round((p.lockedPrds / p.totalPrds) * 100) : 0,
        funnel: funnel.reduce((acc, f) => ({ ...acc, [f.status]: f.count }), {}),
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/export/report — comprehensive analytics report (MUST be before /:id)
router.get('/export/report', async (_req, res) => {
  try {
    const [caseData, leadData, sessionData, messageData, prdData] = await Promise.all([
      db.select().from(cases).leftJoin(leads, eq(cases.leadId, leads.id)).orderBy(desc(cases.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(leads),
      db.select({
        totalSessions: sql<number>`count(*)::int`,
        avgDuration: sql<number>`coalesce(avg(${sessions.durationSeconds}), 0)::int`,
        totalDuration: sql<number>`coalesce(sum(${sessions.durationSeconds}), 0)::int`,
      }).from(sessions),
      db.select({ totalMessages: sql<number>`count(*)::int` }).from(transcripts),
      db.select({
        totalPrds: sql<number>`count(*)::int`,
        lockedPrds: sql<number>`count(*) filter (where ${prdVersions.isLocked} = true)::int`,
      }).from(prdVersions),
    ]);

    const s = sessionData[0];
    const m = messageData[0];
    const p = prdData[0];
    const statusCounts: Record<string, number> = {};
    caseData.forEach(row => {
      const st = row.cases.status;
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    let report = '\uFEFF'; // BOM
    report += '=== AI 輔能諮詢 — 完整分析報告 ===\n';
    report += `報告產生時間: ${new Date().toLocaleString('zh-TW')}\n\n`;

    report += '--- 總覽 ---\n';
    report += `總報名數: ${leadData[0]?.count || 0}\n`;
    report += `案件總數: ${caseData.length}\n`;
    report += `總訪談數: ${s.totalSessions}\n`;
    report += `總訪談時間: ${Math.round(s.totalDuration / 60)} 分鐘\n`;
    report += `平均訪談長度: ${Math.round(s.avgDuration / 60)} 分鐘\n`;
    report += `總訊息數: ${m.totalMessages}\n`;
    report += `PRD 總數: ${p.totalPrds}\n`;
    report += `PRD 鎖版數: ${p.lockedPrds}\n\n`;

    report += '--- 案件狀態分佈 ---\n';
    Object.entries(statusCounts).forEach(([st, ct]) => {
      report += `${st}: ${ct} (${Math.round((ct / caseData.length) * 100)}%)\n`;
    });
    report += '\n';

    report += '--- 案件明細 ---\n';
    report += '案件ID,公司,聯絡人,狀態,優先度,建立時間\n';
    caseData.forEach(row => {
      const c = row.cases;
      const l = row.leads;
      report += `${c.id},"${l?.company || ''}","${l?.contactName || ''}",${c.status},${c.priority},${c.createdAt.toISOString()}\n`;
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics_report.txt');
    res.send(report);
  } catch (err) {
    console.error('Report export error:', err);
    res.status(500).json({ success: false, message: '報告匯出失敗' });
  }
});

// GET /api/cases/export/csv (MUST be before /:id)
router.get('/export/csv', async (_req, res) => {
  try {
    const data = await db
      .select()
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .orderBy(desc(cases.createdAt));

    const header = '案件ID,公司,聯絡人,Email,電話,公司規模,狀態,優先度,需求類型,產業,建立時間\n';
    const rows = data.map(row => {
      const c = row.cases;
      const l = row.leads;
      return [
        c.id,
        `"${(l?.company || '').replace(/"/g, '""')}"`,
        `"${(l?.contactName || '').replace(/"/g, '""')}"`,
        l?.email || '',
        l?.phone || '',
        l?.companySize || '',
        c.status,
        c.priority,
        `"${(l?.needTypes || []).join('、')}"`,
        l?.industry || '',
        c.createdAt.toISOString(),
      ].join(',');
    }).join('\n');

    const csv = '\uFEFF' + header + rows; // BOM for Excel Chinese support
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=cases_export.csv');
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ success: false, message: '匯出失敗' });
  }
});

// GET /api/cases/activity-feed — unified activity feed (MUST be before /:id)
router.get('/activity-feed', async (_req, res) => {
  try {
    // Get recent status changes
    const statusChanges = await db
      .select({
        id: caseStatusHistory.id,
        type: sql<string>`'status_change'`,
        caseId: caseStatusHistory.caseId,
        detail: sql<string>`concat(${caseStatusHistory.fromStatus}, ' → ', ${caseStatusHistory.toStatus})`,
        userName: users.name,
        createdAt: caseStatusHistory.createdAt,
      })
      .from(caseStatusHistory)
      .leftJoin(users, eq(caseStatusHistory.userId, users.id))
      .orderBy(desc(caseStatusHistory.createdAt))
      .limit(10);

    // Get recent comments
    const recentComments = await db
      .select({
        id: caseComments.id,
        type: sql<string>`'comment'`,
        caseId: caseComments.caseId,
        detail: sql<string>`left(${caseComments.content}, 80)`,
        userName: users.name,
        createdAt: caseComments.createdAt,
      })
      .from(caseComments)
      .leftJoin(users, eq(caseComments.userId, users.id))
      .orderBy(desc(caseComments.createdAt))
      .limit(10);

    // Get recent cases created
    const recentCases = await db
      .select({
        id: cases.id,
        type: sql<string>`'new_case'`,
        caseId: cases.id,
        detail: cases.title,
        userName: sql<string>`null`,
        createdAt: cases.createdAt,
      })
      .from(cases)
      .orderBy(desc(cases.createdAt))
      .limit(10);

    // Merge and sort
    const allEvents = [...statusChanges, ...recentComments, ...recentCases]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);

    res.json({ success: true, data: allEvents });
  } catch (err) {
    console.error('Activity feed error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/export/json (MUST be before /:id)
router.get('/export/json', async (_req, res) => {
  try {
    const data = await db
      .select()
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .orderBy(desc(cases.createdAt));

    const exportData = data.map(row => ({
      case: {
        id: row.cases.id,
        status: row.cases.status,
        priority: row.cases.priority,
        title: row.cases.title,
        tags: row.cases.tags,
        isPinned: row.cases.isPinned,
        scheduledAt: row.cases.scheduledAt,
        completedAt: row.cases.completedAt,
        createdAt: row.cases.createdAt,
      },
      lead: row.leads ? {
        company: row.leads.company,
        contactName: row.leads.contactName,
        title: row.leads.title,
        email: row.leads.email,
        phone: row.leads.phone,
        companySize: row.leads.companySize,
        needTypes: row.leads.needTypes,
        industry: row.leads.industry,
        description: row.leads.description,
        painPoints: row.leads.painPoints,
        expectedOutcome: row.leads.expectedOutcome,
        existingTools: row.leads.existingTools,
      } : null,
    }));

    const json = JSON.stringify({ exportedAt: new Date().toISOString(), total: exportData.length, data: exportData }, null, 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=cases_export.json');
    res.send(json);
  } catch (err) {
    console.error('JSON export error:', err);
    res.status(500).json({ success: false, message: '匯出失敗' });
  }
});

// GET /api/cases/history/:id — status change audit log (MUST be before /:id)
router.get('/history/:id', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const data = await db
      .select({
        id: caseStatusHistory.id,
        fromStatus: caseStatusHistory.fromStatus,
        toStatus: caseStatusHistory.toStatus,
        note: caseStatusHistory.note,
        createdAt: caseStatusHistory.createdAt,
        userName: users.name,
      })
      .from(caseStatusHistory)
      .leftJoin(users, eq(caseStatusHistory.userId, users.id))
      .where(eq(caseStatusHistory.caseId, caseId))
      .orderBy(desc(caseStatusHistory.createdAt));

    res.json({ success: true, data });
  } catch (err) {
    console.error('History error:', err);
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
        consultant: true,
        sessions: true,
        prdVersions: { orderBy: (pv, { desc }) => [desc(pv.versionNumber)] },
      },
    });

    if (!result) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }

    // Strip password hash from consultant
    const { consultant, ...rest } = result as any;
    const safeConsultant = consultant
      ? { id: consultant.id, name: consultant.name, email: consultant.email, role: consultant.role }
      : null;

    const leadScore = result.lead ? computeLeadScore(result.lead) : 0;
    res.json({ success: true, data: { ...rest, consultant: safeConsultant, leadScore } });
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

    const { status, priority, consultantId, scheduledAt, title, notes, tags } = result.data;
    const updates: Record<string, unknown> = {};

    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (consultantId !== undefined) updates.consultantId = consultantId;
    if (scheduledAt) updates.scheduledAt = new Date(scheduledAt);
    if (title) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, message: '無更新欄位' });
      return;
    }

    // Get current status before update for audit log
    let oldStatus: string | null = null;
    if (status) {
      const [current] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, id)).limit(1);
      if (current) oldStatus = current.status;
    }

    const [updated] = await db
      .update(cases)
      .set(updates)
      .where(eq(cases.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: '找不到該案件' });
      return;
    }

    // Record status change in audit log + notify
    if (status && oldStatus && oldStatus !== status) {
      const userId = (req as any).user?.userId;
      db.insert(caseStatusHistory).values({
        caseId: id,
        userId: userId || null,
        fromStatus: oldStatus as any,
        toStatus: status as any,
      }).catch(() => {});
      // Notify all admins about status change
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
      for (const admin of admins) {
        if (admin.id !== userId) {
          db.insert(notifications).values({
            userId: admin.id,
            type: 'status_change',
            title: `案件 #${id} 狀態變更`,
            message: `${oldStatus} → ${status}`,
            link: `/admin/cases/${id}`,
          }).catch(() => {});
        }
      }
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

// GET /api/cases/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const data = await db
      .select({
        id: caseComments.id,
        content: caseComments.content,
        createdAt: caseComments.createdAt,
        userId: caseComments.userId,
        userName: users.name,
        userRole: users.role,
      })
      .from(caseComments)
      .leftJoin(users, eq(caseComments.userId, users.id))
      .where(eq(caseComments.caseId, caseId))
      .orderBy(desc(caseComments.createdAt));

    res.json({ success: true, data });
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/cases/:id/comments
router.post('/:id/comments', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ success: false, message: '請輸入留言內容' });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ success: false, message: '留言不可超過 2000 字' });
      return;
    }

    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: '請先登入' });
      return;
    }

    const [comment] = await db
      .insert(caseComments)
      .values({ caseId, userId, content: content.trim() })
      .returning();

    const user = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);

    // Notify other admins about new comment
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    for (const admin of admins) {
      if (admin.id !== userId) {
        db.insert(notifications).values({
          userId: admin.id,
          type: 'comment',
          title: `案件 #${caseId} 新留言`,
          message: content.trim().slice(0, 100),
          link: `/admin/cases/${caseId}`,
        }).catch(() => {});
      }
    }

    res.json({
      success: true,
      data: {
        ...comment,
        userName: user[0]?.name || '',
        userRole: user[0]?.role || '',
      },
    });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// DELETE /api/cases/:id/comments/:commentId
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    if (isNaN(commentId)) {
      res.status(400).json({ success: false, message: '無效的留言 ID' });
      return;
    }

    const userId = (req as any).user?.userId;
    const [comment] = await db.select().from(caseComments).where(eq(caseComments.id, commentId)).limit(1);

    if (!comment) {
      res.status(404).json({ success: false, message: '找不到留言' });
      return;
    }

    // Only allow author or admin to delete
    const userRole = (req as any).user?.role;
    if (comment.userId !== userId && userRole !== 'admin') {
      res.status(403).json({ success: false, message: '無權刪除此留言' });
      return;
    }

    await db.delete(caseComments).where(eq(caseComments.id, commentId));
    res.json({ success: true, message: '留言已刪除' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:id/duplicates — find potential duplicate cases
router.get('/:id/duplicates', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    // Get the case's lead info
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!caseRow) {
      res.status(404).json({ success: false, message: '找不到案件' });
      return;
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, caseRow.leadId)).limit(1);
    if (!lead) {
      res.json({ success: true, data: [] });
      return;
    }

    // Find other leads with same email or company name
    const dupes = await db
      .select({
        caseId: cases.id,
        status: cases.status,
        company: leads.company,
        contactName: leads.contactName,
        email: leads.email,
        createdAt: cases.createdAt,
      })
      .from(cases)
      .innerJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          sql`${cases.id} != ${caseId}`,
          or(
            eq(leads.email, lead.email),
            eq(leads.company, lead.company),
          ),
        ),
      )
      .orderBy(desc(cases.createdAt))
      .limit(10);

    res.json({ success: true, data: dupes });
  } catch (err) {
    console.error('Find duplicates error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:id/report — export case report as markdown
router.get('/:id/report', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!caseRow) {
      res.status(404).json({ success: false, message: '找不到案件' });
      return;
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, caseRow.leadId)).limit(1);
    const caseCommentsList = await db
      .select({ content: caseComments.content, createdAt: caseComments.createdAt, userName: users.name })
      .from(caseComments)
      .leftJoin(users, eq(caseComments.userId, users.id))
      .where(eq(caseComments.caseId, caseId))
      .orderBy(desc(caseComments.createdAt))
      .limit(50);
    const history = await db
      .select({ fromStatus: caseStatusHistory.fromStatus, toStatus: caseStatusHistory.toStatus, createdAt: caseStatusHistory.createdAt })
      .from(caseStatusHistory)
      .where(eq(caseStatusHistory.caseId, caseId))
      .orderBy(desc(caseStatusHistory.createdAt))
      .limit(50);

    const statusLabels: Record<string, string> = {
      new: '新案件', scheduled: '已排程', interviewing: '訪談中', pending_review: '待審閱',
      prd_draft: 'PRD 草稿', prd_locked: 'PRD 鎖版', mvp: 'MVP 中', closed: '已結案',
    };
    const priorityLabels: Record<string, string> = { urgent: '緊急', high: '高', normal: '一般', low: '低' };

    let md = `# 案件報告 #${caseRow.id}\n\n`;
    md += `**標題**: ${caseRow.title}\n`;
    md += `**狀態**: ${statusLabels[caseRow.status] || caseRow.status}\n`;
    md += `**優先度**: ${priorityLabels[caseRow.priority] || caseRow.priority}\n`;
    md += `**建立時間**: ${new Date(caseRow.createdAt).toLocaleString('zh-TW')}\n\n`;

    if (lead) {
      md += `## 客戶資訊\n\n`;
      md += `| 欄位 | 內容 |\n|------|------|\n`;
      md += `| 公司 | ${lead.company} |\n`;
      md += `| 聯絡人 | ${lead.contactName} |\n`;
      md += `| Email | ${lead.email} |\n`;
      md += `| 電話 | ${lead.phone} |\n`;
      md += `| 公司規模 | ${lead.companySize} |\n`;
      if (lead.industry) md += `| 產業別 | ${lead.industry} |\n`;
      md += `| 需求類型 | ${lead.needTypes.join('、')} |\n`;
      if (lead.painPoints) md += `\n**痛點**: ${lead.painPoints}\n`;
      if (lead.expectedOutcome) md += `\n**期望成果**: ${lead.expectedOutcome}\n`;
      if (lead.description) md += `\n**補充說明**: ${lead.description}\n`;
      md += `\n`;
    }

    if (caseRow.notes) {
      md += `## 內部備註\n\n${caseRow.notes}\n\n`;
    }

    if (history.length > 0) {
      md += `## 狀態變更紀錄\n\n`;
      history.forEach(h => {
        md += `- ${statusLabels[h.fromStatus || ''] || h.fromStatus || '–'} → ${statusLabels[h.toStatus] || h.toStatus} (${new Date(h.createdAt).toLocaleString('zh-TW')})\n`;
      });
      md += `\n`;
    }

    if (caseCommentsList.length > 0) {
      md += `## 團隊留言\n\n`;
      caseCommentsList.forEach(c => {
        md += `> **${c.userName || '匿名'}** (${new Date(c.createdAt).toLocaleString('zh-TW')})\n>\n> ${c.content}\n\n`;
      });
    }

    md += `---\n*報告產生時間: ${new Date().toLocaleString('zh-TW')}*\n`;

    const format = req.query.format;
    if (format === 'pdf') {
      try {
        const { mdToPdf } = await import('md-to-pdf');
        const pdf = await mdToPdf({ content: md }, {
          pdf_options: { format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } },
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="case_${caseId}_report.pdf"`);
        res.send(pdf.content);
      } catch (pdfErr) {
        console.error('PDF generation failed:', pdfErr);
        res.status(500).json({ success: false, message: 'PDF 產生失敗' });
      }
    } else {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="case_${caseId}_report.md"`);
      res.send(md);
    }
  } catch (err) {
    console.error('Case report error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
