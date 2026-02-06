import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';

interface Lead {
  id: number;
  company: string;
  contactName: string;
  title: string | null;
  email: string;
  phone: string;
  companySize: string;
  needTypes: string[];
  description: string | null;
  createdAt: string;
}

interface CaseDetail {
  id: number;
  leadId: number;
  status: string;
  title: string;
  consultantId: number | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  lead: Lead;
  sessions: Array<{ id: number; startedAt: string; endedAt: string | null; durationSeconds: number | null }>;
  prdVersions: Array<{ id: number; versionNumber: number; isLocked: boolean; createdAt: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  new: '新案件',
  scheduled: '已排程',
  interviewing: '訪談中',
  pending_review: '待審閱',
  prd_draft: 'PRD 草稿',
  prd_locked: 'PRD 鎖版',
  mvp: 'MVP 中',
  closed: '已結案',
};

const STATUS_OPTIONS = ['new', 'scheduled', 'interviewing', 'pending_review', 'prd_draft', 'prd_locked', 'mvp', 'closed'];

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { authFetch, token } = useAuth();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    loadCase();
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCase() {
    setLoading(true);
    try {
      const res = await authFetch(`/api/cases/${id}`);
      const data = await res.json();
      if (data.success) setCaseData(data.data);
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setCaseData(prev => prev ? { ...prev, status: newStatus } : prev);
      }
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setUpdating(false);
    }
  }

  async function lockPrd() {
    setLocking(true);
    try {
      const res = await authFetch(`/api/cases/${id}/prd/lock`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadCase();
      } else {
        alert(data.message || '鎖版失敗');
      }
    } catch (err) {
      console.error('Failed to lock PRD:', err);
    } finally {
      setLocking(false);
    }
  }

  function downloadPrd(format: 'md' | 'pdf', versionNumber?: number) {
    const vParam = versionNumber ? `&version=${versionNumber}` : '';
    const url = `/api/cases/${id}/prd/export?format=${format}${vParam}`;
    // Use a hidden link with auth header via fetch+blob
    authFetch(url).then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    }).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ext = format === 'pdf' ? 'pdf' : 'md';
      a.download = `PRD_v${versionNumber || 'latest'}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch(err => {
      console.error('Download failed:', err);
      alert('匯出失敗');
    });
  }

  if (loading) return <div className="admin-loading">載入中...</div>;
  if (!caseData) return <div className="admin-loading">找不到案件</div>;

  const { lead } = caseData;
  const hasUnlockedDraft = caseData.prdVersions.some(v => !v.isLocked);
  const latestVersion = caseData.prdVersions.length > 0
    ? caseData.prdVersions.reduce((a, b) => a.versionNumber > b.versionNumber ? a : b)
    : null;

  return (
    <div className="case-detail">
      <button className="btn-back-link" onClick={() => navigate('/admin')}>← 返回儀表板</button>

      <div className="case-detail-header">
        <h1>{caseData.title}</h1>
        <div className="case-detail-actions">
          <button
            className="btn-start-interview"
            onClick={() => navigate(`/admin/cases/${id}/interview`)}
          >
            開始訪談
          </button>
          <select
            value={caseData.status}
            onChange={e => updateStatus(e.target.value)}
            disabled={updating}
            className="status-select"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h2>客戶資訊</h2>
          <div className="detail-fields">
            <div className="detail-field"><span className="field-label">公司</span><span>{lead.company}</span></div>
            <div className="detail-field"><span className="field-label">聯絡人</span><span>{lead.contactName}</span></div>
            {lead.title && <div className="detail-field"><span className="field-label">職稱</span><span>{lead.title}</span></div>}
            <div className="detail-field"><span className="field-label">Email</span><span>{lead.email}</span></div>
            <div className="detail-field"><span className="field-label">電話</span><span>{lead.phone}</span></div>
            <div className="detail-field"><span className="field-label">公司規模</span><span>{lead.companySize}</span></div>
            <div className="detail-field">
              <span className="field-label">需求類型</span>
              <div className="need-tags">
                {lead.needTypes.map(n => <span key={n} className="need-tag">{n}</span>)}
              </div>
            </div>
            {lead.description && (
              <div className="detail-field detail-field-full">
                <span className="field-label">需求描述</span>
                <p className="field-description">{lead.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="detail-card">
          <h2>案件狀態</h2>
          <div className="detail-fields">
            <div className="detail-field"><span className="field-label">案件 ID</span><span>#{caseData.id}</span></div>
            <div className="detail-field"><span className="field-label">建立時間</span><span>{new Date(caseData.createdAt).toLocaleString('zh-TW')}</span></div>
            {caseData.scheduledAt && <div className="detail-field"><span className="field-label">排程時間</span><span>{new Date(caseData.scheduledAt).toLocaleString('zh-TW')}</span></div>}
            {caseData.completedAt && <div className="detail-field"><span className="field-label">完成時間</span><span>{new Date(caseData.completedAt).toLocaleString('zh-TW')}</span></div>}
          </div>

          <h3 style={{ marginTop: 24 }}>訪談記錄 ({caseData.sessions.length})</h3>
          {caseData.sessions.length === 0 ? (
            <p className="empty-hint">尚無訪談記錄</p>
          ) : (
            <ul className="session-list">
              {caseData.sessions.map(s => (
                <li key={s.id}>
                  Session #{s.id} — {new Date(s.startedAt).toLocaleString('zh-TW')}
                  {s.durationSeconds != null && <span className="session-duration"> ({Math.round(s.durationSeconds / 60)} 分鐘)</span>}
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: 24 }}>PRD 版本 ({caseData.prdVersions.length})</h3>
          {caseData.prdVersions.length === 0 ? (
            <p className="empty-hint">尚無 PRD 版本，訪談後自動產生</p>
          ) : (
            <>
              <ul className="prd-version-list">
                {caseData.prdVersions
                  .sort((a, b) => b.versionNumber - a.versionNumber)
                  .map(v => (
                  <li key={v.id} className="prd-version-item">
                    <div className="prd-version-info">
                      <span className="prd-version-label">
                        v{v.versionNumber} {v.isLocked ? '(已鎖版)' : '(草稿)'}
                      </span>
                      <span className="prd-version-date">{new Date(v.createdAt).toLocaleString('zh-TW')}</span>
                    </div>
                    <div className="prd-version-actions">
                      <button className="btn-export-sm" onClick={() => downloadPrd('md', v.versionNumber)}>MD</button>
                      <button className="btn-export-sm" onClick={() => downloadPrd('pdf', v.versionNumber)}>PDF</button>
                    </div>
                  </li>
                ))}
              </ul>
              {hasUnlockedDraft && (
                <button
                  className="btn-lock-prd"
                  onClick={lockPrd}
                  disabled={locking}
                >
                  {locking ? '鎖版中...' : '鎖定 PRD 版本'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
