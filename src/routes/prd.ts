import { Router } from 'express';
import { db } from '../db/index.js';
import { prdVersions, cases, leads, artifacts } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { buildPrdMarkdown, exportPrdToPdf } from '../lib/prd-export.js';
import type { JwtPayload } from '../lib/auth.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'data', 'artifacts');

const router = Router();
router.use(requireAuth);

// GET /api/cases/:caseId/prd — get latest PRD
router.get('/:caseId/prd', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const [prd] = await db.select().from(prdVersions)
      .where(eq(prdVersions.caseId, caseId))
      .orderBy(desc(prdVersions.versionNumber))
      .limit(1);

    res.json({ success: true, data: prd || null });
  } catch (err) {
    console.error('Get PRD error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:caseId/prd/versions — list all versions
router.get('/:caseId/prd/versions', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const versions = await db.select({
      id: prdVersions.id,
      versionNumber: prdVersions.versionNumber,
      isLocked: prdVersions.isLocked,
      lockedAt: prdVersions.lockedAt,
      completeness: prdVersions.content,
      createdAt: prdVersions.createdAt,
      updatedAt: prdVersions.updatedAt,
    }).from(prdVersions)
      .where(eq(prdVersions.caseId, caseId))
      .orderBy(desc(prdVersions.versionNumber));

    // Extract completeness from content JSONB
    const result = versions.map(v => ({
      id: v.id,
      versionNumber: v.versionNumber,
      isLocked: v.isLocked,
      lockedAt: v.lockedAt,
      completeness: (v.completeness as any)?.metadata?.completeness || 0,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('List PRD versions error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:caseId/prd/versions/:version — get specific version
router.get('/:caseId/prd/versions/:version', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    const versionNumber = parseInt(req.params.version);
    if (isNaN(caseId) || isNaN(versionNumber)) {
      res.status(400).json({ success: false, message: '無效的參數' });
      return;
    }

    const [prd] = await db.select().from(prdVersions)
      .where(and(
        eq(prdVersions.caseId, caseId),
        eq(prdVersions.versionNumber, versionNumber),
      ))
      .limit(1);

    if (!prd) {
      res.status(404).json({ success: false, message: '找不到該版本' });
      return;
    }

    res.json({ success: true, data: prd });
  } catch (err) {
    console.error('Get PRD version error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/cases/:caseId/prd/lock — lock current draft and create snapshot
router.post('/:caseId/prd/lock', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const user = (req as any).user as JwtPayload;

    // Find current unlocked draft
    const [draft] = await db.select().from(prdVersions)
      .where(and(
        eq(prdVersions.caseId, caseId),
        eq(prdVersions.isLocked, false),
      ))
      .orderBy(desc(prdVersions.versionNumber))
      .limit(1);

    if (!draft) {
      res.status(404).json({ success: false, message: '找不到 PRD 草稿' });
      return;
    }

    const now = new Date();

    // Lock the draft
    const [locked] = await db.update(prdVersions)
      .set({
        isLocked: true,
        lockedAt: now,
        lockedBy: user.userId,
      })
      .where(eq(prdVersions.id, draft.id))
      .returning();

    // Update case status
    await db.update(cases).set({ status: 'prd_locked' }).where(eq(cases.id, caseId));

    res.json({ success: true, data: locked });
  } catch (err) {
    console.error('Lock PRD error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// PATCH /api/cases/:caseId/prd/draft — manual edit of draft sections
router.patch('/:caseId/prd/draft', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const { sectionKey, content: sectionContent } = req.body;
    if (!sectionKey || typeof sectionContent !== 'string') {
      res.status(400).json({ success: false, message: '缺少 sectionKey 或 content' });
      return;
    }

    // Find current unlocked draft
    const [draft] = await db.select().from(prdVersions)
      .where(and(
        eq(prdVersions.caseId, caseId),
        eq(prdVersions.isLocked, false),
      ))
      .orderBy(desc(prdVersions.versionNumber))
      .limit(1);

    if (!draft) {
      res.status(404).json({ success: false, message: '找不到未鎖定的草稿' });
      return;
    }

    const updatedSections = { ...draft.content.sections, [sectionKey]: sectionContent };
    const { PRD_SECTION_KEYS } = await import('../agent/prompts/system.js');
    const filled = PRD_SECTION_KEYS.filter((k: string) => updatedSections[k] && updatedSections[k]!.trim().length > 0);
    const completeness = Math.round((filled.length / PRD_SECTION_KEYS.length) * 100);

    const [updated] = await db.update(prdVersions)
      .set({
        content: { sections: updatedSections, metadata: { completeness, lastUpdatedSection: sectionKey } },
        markdown: buildPrdMarkdown(updatedSections, ''),
      })
      .where(eq(prdVersions.id, draft.id))
      .returning();

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Edit PRD draft error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/cases/:caseId/prd/export?format=md|pdf&version=N — export PRD
router.get('/:caseId/prd/export', async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId);
    if (isNaN(caseId)) {
      res.status(400).json({ success: false, message: '無效的案件 ID' });
      return;
    }

    const format = (req.query.format as string) || 'md';
    const versionNum = req.query.version ? parseInt(req.query.version as string) : undefined;

    // Get PRD version
    let prd;
    if (versionNum) {
      [prd] = await db.select().from(prdVersions)
        .where(and(eq(prdVersions.caseId, caseId), eq(prdVersions.versionNumber, versionNum)))
        .limit(1);
    } else {
      [prd] = await db.select().from(prdVersions)
        .where(eq(prdVersions.caseId, caseId))
        .orderBy(desc(prdVersions.versionNumber))
        .limit(1);
    }

    if (!prd) {
      res.status(404).json({ success: false, message: '找不到 PRD' });
      return;
    }

    // Get case + lead info for title
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    const [lead] = caseRow
      ? await db.select().from(leads).where(eq(leads.id, caseRow.leadId)).limit(1)
      : [null];

    const companyName = lead?.company || '未知公司';
    const markdown = buildPrdMarkdown(prd.content.sections, companyName, prd.versionNumber, prd.isLocked);

    if (format === 'pdf') {
      const pdfBuffer = await exportPrdToPdf(markdown);

      // Save artifact
      await mkdir(ARTIFACTS_DIR, { recursive: true });
      const filename = `PRD_${companyName}_v${prd.versionNumber}.pdf`;
      const storagePath = join(ARTIFACTS_DIR, `${caseId}_${prd.versionNumber}_${Date.now()}.pdf`);
      await writeFile(storagePath, pdfBuffer);

      await db.insert(artifacts).values({
        caseId,
        prdVersionId: prd.id,
        filename,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        storagePath,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(pdfBuffer);
    } else {
      const filename = `PRD_${companyName}_v${prd.versionNumber}.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(markdown);
    }
  } catch (err) {
    console.error('Export PRD error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
