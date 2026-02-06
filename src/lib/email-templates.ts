const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#a855f7);padding:24px 32px;">
          <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">AI 輔能諮詢</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">此郵件由 AI 輔能諮詢系統自動發送，請勿直接回覆。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Registration confirmation email — sent to client after signup */
export function registrationConfirmation(data: {
  contactName: string;
  company: string;
  needTypes: string[];
}): { subject: string; html: string } {
  return {
    subject: `報名成功 — ${data.company} AI 輔能諮詢`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${data.contactName} 您好！</h2>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        感謝您代表 <strong>${data.company}</strong> 報名 AI 輔能諮詢服務。我們已收到您的報名資訊。
      </p>
      <div style="background:#f0f9ff;border-left:4px solid #6366f1;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px;">
        <p style="margin:0;color:#374151;font-size:14px;"><strong>需求類型：</strong>${data.needTypes.join('、')}</p>
      </div>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        我們的顧問團隊將在 <strong>1-2 個工作天</strong>內與您聯繫，安排一對一深度訪談。
        訪談過程約 30-60 分鐘，由 AI 輔助顧問即時整理需求，產出結構化 PRD 文件。
      </p>
      <h3 style="color:#374151;font-size:15px;margin:0 0 8px;">接下來會發生什麼？</h3>
      <ol style="color:#475569;line-height:2;margin:0;padding-left:20px;">
        <li>我們的顧問將聯繫您確認訪談時間</li>
        <li>進行線上一對一深度訪談</li>
        <li>AI 即時整理訪談內容，產生 PRD 文件</li>
        <li>您將收到完整的 PRD（PDF 格式）</li>
      </ol>
    `),
  };
}

/** Interview scheduled notification — sent to client */
export function interviewScheduled(data: {
  contactName: string;
  company: string;
  scheduledAt: string;
}): { subject: string; html: string } {
  const dateStr = new Date(data.scheduledAt).toLocaleString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return {
    subject: `訪談已排程 — ${dateStr}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${data.contactName} 您好！</h2>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        您的 AI 輔能諮詢訪談已排定，以下是訪談資訊：
      </p>
      <div style="background:#f0f9ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>公司：</strong>${data.company}</p>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>時間：</strong>${dateStr}</p>
        <p style="margin:0;color:#374151;font-size:14px;"><strong>方式：</strong>線上一對一訪談（約 30-60 分鐘）</p>
      </div>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        訪談當天，顧問將引導您逐步釐清需求，AI 助理會即時整理重點並產出 PRD。
        請提前思考您希望解決的核心問題和期望目標。
      </p>
      <p style="color:#94a3b8;font-size:13px;margin:0;">
        如需更改時間，請直接回覆此信或聯繫您的顧問。
      </p>
    `),
  };
}

/** PRD locked notification — sent to client with download info */
export function prdLocked(data: {
  contactName: string;
  company: string;
  versionNumber: number;
  completeness: number;
}): { subject: string; html: string } {
  return {
    subject: `PRD 文件已完成 — ${data.company} v${data.versionNumber}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${data.contactName} 您好！</h2>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        好消息！您的 <strong>${data.company}</strong> 產品需求文件（PRD）已完成並鎖版。
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>版本：</strong>v${data.versionNumber}</p>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>完成度：</strong>${data.completeness}%</p>
        <p style="margin:0;color:#374151;font-size:14px;"><strong>狀態：</strong>已鎖版（最終版）</p>
      </div>
      <p style="color:#475569;line-height:1.8;margin:0 0 16px;">
        您的顧問將把 PRD 文件（PDF 格式）寄送給您，或您可以登入系統直接下載。
      </p>
      <p style="color:#475569;line-height:1.8;margin:0;">
        如對文件內容有任何疑問或需要修改，請隨時聯繫您的顧問。
      </p>
    `),
  };
}
