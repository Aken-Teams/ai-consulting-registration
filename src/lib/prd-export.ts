import type { PrdSection } from '../db/schema.js';

const SECTION_LABELS: Record<string, string> = {
  background: '背景與目標',
  users: '使用者與情境',
  scope: '需求範圍（In/Out of Scope）',
  asIs: '現況流程（AS-IS）與痛點',
  toBe: '目標流程（TO-BE）與規則',
  userStories: '功能需求（User Stories）',
  acceptance: '驗收標準（Acceptance Criteria）',
  dataModel: '資料與欄位',
  permissions: '權限與角色',
  nonFunctional: '非功能需求',
  kpi: '成功指標（KPI）',
  risks: '風險與依賴',
  mvpScope: 'MVP 切分建議',
};

const SECTION_ORDER = [
  'background', 'users', 'scope', 'asIs', 'toBe',
  'userStories', 'acceptance', 'dataModel', 'permissions',
  'nonFunctional', 'kpi', 'risks', 'mvpScope',
];

/** Build a full Markdown document from PRD sections */
export function buildPrdMarkdown(
  sections: PrdSection,
  companyName: string,
  versionNumber?: number,
  isLocked?: boolean,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  const lines: string[] = [];

  // Title page
  lines.push(`# 產品需求文件（PRD）`);
  lines.push('');
  if (companyName) {
    lines.push(`**客戶：** ${companyName}`);
  }
  if (versionNumber !== undefined) {
    lines.push(`**版本：** v${versionNumber}${isLocked ? '（已鎖版）' : '（草稿）'}`);
  }
  lines.push(`**產生日期：** ${dateStr}`);
  lines.push(`**產生方式：** AI 輔能諮詢系統自動產生`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Table of contents
  lines.push('## 目錄');
  lines.push('');
  let tocIndex = 1;
  for (const key of SECTION_ORDER) {
    if (sections[key as keyof PrdSection]?.trim()) {
      lines.push(`${tocIndex}. [${SECTION_LABELS[key]}](#${tocIndex})`);
      tocIndex++;
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sections
  let sectionNum = 1;
  for (const key of SECTION_ORDER) {
    const content = sections[key as keyof PrdSection]?.trim();
    if (content) {
      lines.push(`## ${sectionNum}. ${SECTION_LABELS[key]}`);
      lines.push('');
      lines.push(content);
      lines.push('');
      lines.push('---');
      lines.push('');
      sectionNum++;
    }
  }

  // Footer
  lines.push('');
  lines.push('*本文件由 AI 輔能諮詢系統自動產生，內容基於訪談對話整理。*');

  return lines.join('\n');
}

/** Convert PRD Markdown to PDF buffer */
export async function exportPrdToPdf(markdown: string): Promise<Buffer> {
  const { mdToPdf } = await import('md-to-pdf');

  const result = await mdToPdf(
    { content: markdown },
    {
      stylesheet: [],
      css: `
        body {
          font-family: 'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif;
          font-size: 12pt;
          line-height: 1.8;
          color: #1a1a1a;
        }
        h1 {
          font-size: 22pt;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 0.5em;
          border-bottom: 3px solid #6366f1;
          padding-bottom: 0.3em;
        }
        h2 {
          font-size: 16pt;
          font-weight: 700;
          color: #334155;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.2em;
        }
        h3 { font-size: 13pt; font-weight: 600; color: #475569; }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 1em 0; }
        ul, ol { padding-left: 1.5em; }
        li { margin-bottom: 0.3em; }
        table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
        th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 11pt; }
        th { background: #f1f5f9; font-weight: 600; }
        code { background: #f1f5f9; padding: 2px 4px; border-radius: 3px; font-size: 10pt; }
        pre { background: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 3px solid #6366f1; padding-left: 12px; color: #64748b; margin: 0.5em 0; }
        strong { color: #1e293b; }
      `,
      pdf_options: {
        format: 'A4',
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '18mm',
          right: '18mm',
        },
        printBackground: true,
      },
    },
  );

  return Buffer.from(result.content);
}
