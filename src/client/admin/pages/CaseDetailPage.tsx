import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { Markdown } from '../components/Markdown';

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
  industry: string | null;
  painPoints: string | null;
  expectedOutcome: string | null;
  existingTools: string | null;
  preferredTimeslots: string[] | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  voiceIntakeData: {
    background?: string;
    currentState?: string;
    painPoints?: string;
    expectedOutcome?: string;
  } | null;
  createdAt: string;
}

interface Consultant {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface CaseDetail {
  id: number;
  leadId: number;
  status: string;
  priority: string;
  title: string;
  tags: string[] | null;
  leadScore: number;
  consultantId: number | null;
  consultant: { id: number; name: string; email: string } | null;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
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

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '緊急',
  high: '高',
  normal: '一般',
  low: '低',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#6366f1',
  low: '#94a3b8',
};

const PRIORITY_OPTIONS = ['urgent', 'high', 'normal', 'low'];

const SLA_HOURS: Record<string, number> = {
  new: 24, scheduled: 72, interviewing: 48, pending_review: 24, prd_draft: 72,
};

const PRD_LABELS: Record<string, string> = {
  background: '背景與目標', users: '使用者與情境', scope: '需求範圍',
  asIs: '現況流程', toBe: '目標流程', userStories: '功能需求',
  acceptance: '驗收標準', dataModel: '資料與欄位', permissions: '權限與角色',
  nonFunctional: '非功能需求', kpi: '成功指標', risks: '風險與依賴',
  mvpScope: 'MVP 切分建議',
};

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { authFetch, token } = useAuth();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [prdSections, setPrdSections] = useState<Record<string, string>>({});
  const [prdCompleteness, setPrdCompleteness] = useState(0);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingPrd, setSavingPrd] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[number, number]>([0, 0]);
  const [compareData, setCompareData] = useState<[Record<string, string>, Record<string, string>] | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [caseNotes, setCaseNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');
  const [comments, setComments] = useState<Array<{ id: number; content: string; createdAt: string; userId: number; userName: string; userRole: string }>>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [statusHistory, setStatusHistory] = useState<Array<{ id: number; fromStatus: string | null; toStatus: string; userName: string | null; createdAt: string }>>([]);
  const [duplicates, setDuplicates] = useState<Array<{ caseId: number; status: string; company: string; contactName: string; email: string; createdAt: string }>>([]);

  useEffect(() => {
    loadCase();
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCase() {
    setLoading(true);
    try {
      const [caseRes, prdRes, usersRes, commentsRes, historyRes] = await Promise.all([
        authFetch(`/api/cases/${id}`),
        authFetch(`/api/cases/${id}/prd`),
        authFetch('/api/auth/users'),
        authFetch(`/api/cases/${id}/comments`),
        authFetch(`/api/cases/history/${id}`),
      ]);
      const data = await caseRes.json();
      if (data.success) {
        setCaseData(data.data);
        setCaseNotes(data.data.notes || '');
      }
      const prdData = await prdRes.json();
      if (prdData.success && prdData.data?.content) {
        setPrdSections(prdData.data.content.sections || {});
        setPrdCompleteness(prdData.data.content.metadata?.completeness || 0);
      }
      const usersData = await usersRes.json();
      if (usersData.success) setConsultants(usersData.data);
      const commentsData = await commentsRes.json();
      if (commentsData.success) setComments(commentsData.data);
      const historyData = await historyRes.json();
      if (historyData.success) setStatusHistory(historyData.data);
      // Load duplicates
      authFetch(`/api/cases/${id}/duplicates`).then(r => r.json()).then(d => {
        if (d.success) setDuplicates(d.data);
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to load case:', err);
    } finally {
      setLoading(false);
    }
  }

  async function savePrdSection(sectionKey: string, content: string) {
    setSavingPrd(true);
    try {
      const res = await authFetch(`/api/cases/${id}/prd/draft`, {
        method: 'PATCH',
        body: JSON.stringify({ sectionKey, content }),
      });
      const data = await res.json();
      if (data.success) {
        setPrdSections(prev => ({ ...prev, [sectionKey]: content }));
        setEditingSection(null);
        setEditContent('');
        await loadCase();
      } else {
        alert(data.message || '儲存失敗');
      }
    } catch (err) {
      console.error('Failed to save PRD section:', err);
    } finally {
      setSavingPrd(false);
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
        // Refresh history after status change
        authFetch(`/api/cases/history/${id}`).then(r => r.json()).then(d => {
          if (d.success) setStatusHistory(d.data);
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setUpdating(false);
    }
  }

  async function updatePriority(newPriority: string) {
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: newPriority }),
      });
      const data = await res.json();
      if (data.success) {
        setCaseData(prev => prev ? { ...prev, priority: newPriority } : prev);
      }
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  }

  async function postComment() {
    if (!newComment.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await authFetch(`/api/cases/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => [data.data, ...prev]);
        setNewComment('');
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteComment(commentId: number) {
    try {
      const res = await authFetch(`/api/cases/${id}/comments/${commentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  }

  async function addTag(tag: string) {
    if (!tag.trim() || !caseData) return;
    const currentTags = caseData.tags || [];
    if (currentTags.includes(tag.trim())) return;
    const newTags = [...currentTags, tag.trim()];
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tags: newTags }),
      });
      const data = await res.json();
      if (data.success) {
        setCaseData(prev => prev ? { ...prev, tags: newTags } : prev);
        setNewTag('');
      }
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  }

  async function removeTag(tag: string) {
    if (!caseData) return;
    const newTags = (caseData.tags || []).filter(t => t !== tag);
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tags: newTags }),
      });
      const data = await res.json();
      if (data.success) {
        setCaseData(prev => prev ? { ...prev, tags: newTags } : prev);
      }
    } catch (err) {
      console.error('Failed to remove tag:', err);
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

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: caseNotes }),
      });
      const data = await res.json();
      if (data.success) {
        setNotesEditing(false);
      }
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  }

  async function loadCompare(v1: number, v2: number) {
    setLoadingCompare(true);
    try {
      const [res1, res2] = await Promise.all([
        authFetch(`/api/cases/${id}/prd/versions/${v1}`),
        authFetch(`/api/cases/${id}/prd/versions/${v2}`),
      ]);
      const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
      if (d1.success && d2.success) {
        setCompareData([
          d1.data.content?.sections || {},
          d2.data.content?.sections || {},
        ]);
      }
    } catch (err) {
      console.error('Failed to load comparison:', err);
    } finally {
      setLoadingCompare(false);
    }
  }

  async function assignConsultant(consultantId: number | null) {
    setAssigning(true);
    try {
      const body: Record<string, unknown> = { consultantId: consultantId || undefined };
      if (!consultantId) body.consultantId = null;
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        await loadCase();
      }
    } catch (err) {
      console.error('Failed to assign:', err);
    } finally {
      setAssigning(false);
    }
  }

  async function scheduleCase() {
    if (!scheduleDate) return;
    setScheduling(true);
    try {
      const res = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'scheduled', scheduledAt: new Date(scheduleDate).toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        setScheduleDate('');
        await loadCase();
      } else {
        alert(data.message || '排程失敗');
      }
    } catch (err) {
      console.error('Failed to schedule:', err);
    } finally {
      setScheduling(false);
    }
  }

  async function deleteCase() {
    if (!confirm('確定要關閉此案件嗎？')) return;
    try {
      const res = await authFetch(`/api/cases/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        navigate('/admin');
      } else {
        alert(data.message || '刪除失敗');
      }
    } catch (err) {
      console.error('Failed to delete case:', err);
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

  const relativeTime = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return `${Math.floor(days / 30)} 個月前`;
  };

  if (loading) return <div className="admin-loading">載入中...</div>;
  if (!caseData) return <div className="admin-loading">找不到案件</div>;

  const { lead } = caseData;
  const hasUnlockedDraft = caseData.prdVersions.some(v => !v.isLocked);
  const latestVersion = caseData.prdVersions.length > 0
    ? caseData.prdVersions.reduce((a, b) => a.versionNumber > b.versionNumber ? a : b)
    : null;

  return (
    <div className="case-detail">
      <nav className="breadcrumb">
        <a className="breadcrumb-link" onClick={() => navigate('/admin')}>儀表板</a>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">案件 #{caseData.id} — {caseData.lead?.company || caseData.title}</span>
      </nav>

      <div className="case-detail-header">
        <div className="case-title-row">
          <h1>{caseData.title}</h1>
          <span className={`lead-score-badge lead-score-lg ${caseData.leadScore >= 70 ? 'score-high' : caseData.leadScore >= 40 ? 'score-mid' : 'score-low'}`}>
            評分 {caseData.leadScore}
          </span>
          {SLA_HOURS[caseData.status] && (() => {
            const elapsed = (Date.now() - new Date(caseData.createdAt).getTime()) / (1000 * 60 * 60);
            const remaining = SLA_HOURS[caseData.status] - elapsed;
            const overdue = remaining <= 0;
            const color = overdue ? '#ef4444' : remaining < SLA_HOURS[caseData.status] * 0.25 ? '#f59e0b' : '#10b981';
            return (
              <span className={`sla-badge-detail ${overdue ? 'sla-overdue' : ''}`} style={{ color }}>
                SLA: {overdue ? `逾期 ${Math.abs(Math.round(remaining))}h` : `剩餘 ${Math.round(remaining)}h`}
              </span>
            );
          })()}
        </div>
        <div className="case-detail-actions">
          <button
            className="btn-start-interview"
            onClick={() => navigate(`/admin/cases/${id}/interview`)}
          >
            開始訪談
          </button>
          <button className="btn-print-case" onClick={() => window.print()}>列印</button>
          <button className="btn-export-report" onClick={() => {
            authFetch(`/api/cases/${id}/report`).then(r => r.blob()).then(b => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(b);
              a.download = `case_${id}_report.md`; a.click();
            });
          }}>匯出報告</button>
          <button className="btn-export-report" onClick={() => {
            authFetch(`/api/cases/${id}/report?format=pdf`).then(r => r.blob()).then(b => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(b);
              a.download = `case_${id}_report.pdf`; a.click();
            });
          }}>匯出 PDF</button>
          {caseData.status !== 'closed' && (
            <button className="btn-delete-case" onClick={deleteCase}>關閉案件</button>
          )}
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
          <select
            value={caseData.priority}
            onChange={e => updatePriority(e.target.value)}
            className="priority-select"
            style={{ borderColor: PRIORITY_COLORS[caseData.priority] }}
          >
            {PRIORITY_OPTIONS.map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status Flow */}
      <div className="status-flow">
        {STATUS_OPTIONS.filter(s => s !== 'closed').map((status, i) => {
          const currentIdx = STATUS_OPTIONS.indexOf(caseData.status);
          const thisIdx = STATUS_OPTIONS.indexOf(status);
          const isCompleted = thisIdx < currentIdx;
          const isCurrent = status === caseData.status;
          return (
            <div key={status} className={`status-flow-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="status-flow-dot">{isCompleted ? '\u2713' : (i + 1)}</div>
              <span className="status-flow-label">{STATUS_LABELS[status]}</span>
              {i < STATUS_OPTIONS.filter(s => s !== 'closed').length - 1 && <div className={`status-flow-line ${isCompleted ? 'completed' : ''}`} />}
            </div>
          );
        })}
      </div>

      {/* Quick Actions Bar */}
      <div className="quick-actions-bar">
        {caseData.status === 'new' && (
          <button className="quick-action-btn qa-schedule" onClick={() => {
            const section = document.querySelector('.schedule-section');
            if (section) section.scrollIntoView({ behavior: 'smooth' });
          }}>
            排程訪談
          </button>
        )}
        {['new', 'scheduled'].includes(caseData.status) && (
          <button className="quick-action-btn qa-interview" onClick={() => navigate(`/admin/cases/${id}/interview`)}>
            開始訪談
          </button>
        )}
        {caseData.status !== 'closed' && (
          <button className="quick-action-btn qa-next" onClick={() => {
            const nextMap: Record<string, string> = {
              new: 'scheduled', scheduled: 'interviewing', interviewing: 'pending_review',
              pending_review: 'prd_draft', prd_draft: 'prd_locked', prd_locked: 'closed', mvp: 'closed',
            };
            const next = nextMap[caseData.status];
            if (next) updateStatus(next);
          }}>
            推進至下一階段
          </button>
        )}
        <div className="quick-action-reminder">
          <input
            type="datetime-local"
            className="reminder-input"
            value={followUpDate}
            onChange={e => setFollowUpDate(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            placeholder="設定追蹤提醒"
          />
          {followUpDate && (
            <span className="reminder-set">提醒: {new Date(followUpDate).toLocaleString('zh-TW')}</span>
          )}
        </div>
      </div>

      {/* Duplicate Warning */}
      {duplicates.length > 0 && (
        <div className="duplicate-case-warning">
          <div className="duplicate-case-header">可能的重複案件 ({duplicates.length})</div>
          <div className="duplicate-case-list">
            {duplicates.map(d => (
              <div key={d.caseId} className="duplicate-case-item" onClick={() => navigate(`/admin/cases/${d.caseId}`)}>
                <span className="duplicate-case-id">#{d.caseId}</span>
                <span className="duplicate-case-company">{d.company}</span>
                <span className="duplicate-case-contact">{d.contactName} ({d.email})</span>
                <span className="status-badge" style={{ background: STATUS_LABELS[d.status] ? undefined : '#64748b' }}>
                  {STATUS_LABELS[d.status] || d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {lead.industry && <div className="detail-field"><span className="field-label">產業別</span><span>{lead.industry}</span></div>}
            {lead.existingTools && <div className="detail-field"><span className="field-label">現有工具</span><span>{lead.existingTools}</span></div>}
            <div className="detail-field">
              <span className="field-label">需求類型</span>
              <div className="need-tags">
                {lead.needTypes.map(n => <span key={n} className="need-tag">{n}</span>)}
              </div>
            </div>
            {lead.painPoints && (
              <div className="detail-field detail-field-full">
                <span className="field-label">痛點</span>
                <p className="field-description">{lead.painPoints}</p>
              </div>
            )}
            {lead.expectedOutcome && (
              <div className="detail-field detail-field-full">
                <span className="field-label">期望成果</span>
                <p className="field-description">{lead.expectedOutcome}</p>
              </div>
            )}
            {lead.description && (
              <div className="detail-field detail-field-full">
                <span className="field-label">補充說明</span>
                <p className="field-description">{lead.description}</p>
              </div>
            )}
            {lead.preferredTimeslots && lead.preferredTimeslots.length > 0 && (
              <div className="detail-field">
                <span className="field-label">偏好時段</span>
                <span>{lead.preferredTimeslots.join('、')}</span>
              </div>
            )}
            {(lead.source || lead.utmSource || lead.referrer) && (
              <div className="detail-field detail-field-full">
                <span className="field-label">來源追蹤</span>
                <div className="source-tags">
                  {lead.source && <span className="source-tag">來源: {lead.source}</span>}
                  {lead.utmSource && <span className="source-tag">UTM: {lead.utmSource}</span>}
                  {lead.utmMedium && <span className="source-tag">媒介: {lead.utmMedium}</span>}
                  {lead.utmCampaign && <span className="source-tag">活動: {lead.utmCampaign}</span>}
                  {lead.referrer && <span className="source-tag referrer-tag" title={lead.referrer}>推薦: {new URL(lead.referrer).hostname}</span>}
                </div>
              </div>
            )}
            {lead.voiceIntakeData && (
              <div className="detail-field detail-field-full">
                <span className="field-label">語音痛點分析</span>
                <div className="voice-intake-result">
                  {lead.voiceIntakeData.background && (
                    <div className="voice-intake-result-item">
                      <strong>背景：</strong>{lead.voiceIntakeData.background}
                    </div>
                  )}
                  {lead.voiceIntakeData.currentState && (
                    <div className="voice-intake-result-item">
                      <strong>現況：</strong>{lead.voiceIntakeData.currentState}
                    </div>
                  )}
                  {lead.voiceIntakeData.painPoints && (
                    <div className="voice-intake-result-item">
                      <strong>痛點：</strong>{lead.voiceIntakeData.painPoints}
                    </div>
                  )}
                  {lead.voiceIntakeData.expectedOutcome && (
                    <div className="voice-intake-result-item">
                      <strong>期望：</strong>{lead.voiceIntakeData.expectedOutcome}
                    </div>
                  )}
                </div>
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
            <div className="detail-field">
              <span className="field-label">負責顧問</span>
              <select
                className="consultant-select"
                value={caseData.consultantId || ''}
                onChange={e => assignConsultant(e.target.value ? parseInt(e.target.value) : null)}
                disabled={assigning}
              >
                <option value="">未指派</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.role === 'admin' ? '管理員' : '顧問'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="tags-editor">
            <span className="field-label">標籤</span>
            <div className="tags-list">
              {(caseData.tags || []).map(t => (
                <span key={t} className="case-tag case-tag-removable">
                  {t}
                  <button className="tag-remove" onClick={() => removeTag(t)}>x</button>
                </span>
              ))}
              <form className="tag-add-form" onSubmit={e => { e.preventDefault(); addTag(newTag); }}>
                <input
                  className="tag-input"
                  type="text"
                  placeholder="新增標籤..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  maxLength={50}
                />
              </form>
            </div>
          </div>

          {(caseData.status === 'new' || caseData.status === 'scheduled') && (
            <div className="schedule-section">
              <h3>排程訪談</h3>
              <div className="schedule-form">
                <input
                  type="datetime-local"
                  className="schedule-input"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <button
                  className="btn-schedule"
                  onClick={scheduleCase}
                  disabled={scheduling || !scheduleDate}
                >
                  {scheduling ? '排程中...' : '確認排程'}
                </button>
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 24 }}>訪談記錄 ({caseData.sessions.length})</h3>
          {caseData.sessions.length === 0 ? (
            <p className="empty-hint">尚無訪談記錄</p>
          ) : (
            <ul className="session-list">
              {caseData.sessions.map(s => (
                <li key={s.id} className="session-item clickable-row" onClick={() => navigate(`/admin/sessions/${s.id}/transcript`)}>
                  <span>Session #{s.id} — {new Date(s.startedAt).toLocaleString('zh-TW')}</span>
                  <span className="session-right">
                    {s.durationSeconds != null && <span className="session-duration">{Math.round(s.durationSeconds / 60)} 分鐘</span>}
                    <span className="session-view-link">查看逐字稿 →</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3>PRD 版本 ({caseData.prdVersions.length})</h3>
            {caseData.prdVersions.length > 0 && (
              <button className="btn-share-prd" onClick={async () => {
                try {
                  const res = await authFetch(`/api/cases/${id}/share-link`);
                  const data = await res.json();
                  if (data.success) {
                    await navigator.clipboard.writeText(data.data.shareUrl);
                    alert('分享連結已複製到剪貼簿！');
                  }
                } catch { alert('產生分享連結失敗'); }
              }}>分享 PRD</button>
            )}
          </div>
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
              <div className="prd-version-bottom-actions">
                {hasUnlockedDraft && (
                  <button
                    className="btn-lock-prd"
                    onClick={lockPrd}
                    disabled={locking}
                  >
                    {locking ? '鎖版中...' : '鎖定 PRD 版本'}
                  </button>
                )}
                {caseData.prdVersions.length >= 2 && (
                  <button
                    className="btn-compare-prd"
                    onClick={() => {
                      const sorted = [...caseData.prdVersions].sort((a, b) => b.versionNumber - a.versionNumber);
                      setCompareVersions([sorted[1].versionNumber, sorted[0].versionNumber]);
                      setCompareMode(!compareMode);
                      if (!compareMode) loadCompare(sorted[1].versionNumber, sorted[0].versionNumber);
                    }}
                  >
                    {compareMode ? '關閉比較' : '比較版本'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* PRD Version Comparison */}
      {compareMode && caseData.prdVersions.length >= 2 && (
        <div className="prd-compare-section">
          <div className="prd-compare-header">
            <h2>版本比較</h2>
            <div className="prd-compare-selectors">
              <select
                value={compareVersions[0]}
                onChange={e => {
                  const v1 = parseInt(e.target.value);
                  setCompareVersions([v1, compareVersions[1]]);
                  loadCompare(v1, compareVersions[1]);
                }}
              >
                {caseData.prdVersions.sort((a, b) => a.versionNumber - b.versionNumber).map(v => (
                  <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>
                ))}
              </select>
              <span>vs</span>
              <select
                value={compareVersions[1]}
                onChange={e => {
                  const v2 = parseInt(e.target.value);
                  setCompareVersions([compareVersions[0], v2]);
                  loadCompare(compareVersions[0], v2);
                }}
              >
                {caseData.prdVersions.sort((a, b) => a.versionNumber - b.versionNumber).map(v => (
                  <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>
                ))}
              </select>
            </div>
          </div>
          {loadingCompare ? (
            <p className="empty-hint">載入中...</p>
          ) : compareData ? (
            <div className="prd-compare-grid">
              {Object.entries(PRD_LABELS).map(([key, label]) => {
                const left = compareData[0][key] || '';
                const right = compareData[1][key] || '';
                const changed = left !== right;
                return (
                  <div key={key} className={`prd-compare-row ${changed ? 'changed' : 'same'}`}>
                    <div className="prd-compare-label">
                      {label}
                      {changed && <span className="compare-changed-badge">已變更</span>}
                    </div>
                    <div className="prd-compare-cells">
                      <div className="prd-compare-cell">
                        {left ? <Markdown content={left} /> : <span className="prd-edit-placeholder">空</span>}
                      </div>
                      <div className="prd-compare-cell">
                        {right ? <Markdown content={right} /> : <span className="prd-edit-placeholder">空</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* Case Notes */}
      <div className="case-notes-section">
        <div className="case-notes-header">
          <h2>內部備註</h2>
          {!notesEditing ? (
            <button className="btn-edit-sm" onClick={() => { setNotesEditing(true); setNotesTab('write'); }}>編輯</button>
          ) : (
            <div className="case-notes-actions">
              <button className="btn-save-sm" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? '儲存中...' : '儲存'}
              </button>
              <button className="btn-cancel-sm" onClick={() => { setNotesEditing(false); setCaseNotes(caseData.notes || ''); }}>取消</button>
            </div>
          )}
        </div>
        {notesEditing ? (
          <>
            <div className="notes-tabs">
              <button className={`notes-tab ${notesTab === 'write' ? 'active' : ''}`} onClick={() => setNotesTab('write')}>撰寫</button>
              <button className={`notes-tab ${notesTab === 'preview' ? 'active' : ''}`} onClick={() => setNotesTab('preview')}>預覽</button>
              <span className="notes-hint">支援 Markdown 格式</span>
            </div>
            {notesTab === 'write' ? (
              <textarea
                className="case-notes-textarea"
                value={caseNotes}
                onChange={e => setCaseNotes(e.target.value)}
                rows={6}
                placeholder="輸入內部備註... 支援 **粗體**、*斜體*、`程式碼`、- 列表"
              />
            ) : (
              <div className="case-notes-content case-notes-preview">
                {caseNotes ? <Markdown content={caseNotes} /> : <span className="empty-hint">尚無內容</span>}
              </div>
            )}
          </>
        ) : (
          <div className="case-notes-content">
            {caseNotes ? <Markdown content={caseNotes} /> : <span className="empty-hint">尚無備註</span>}
          </div>
        )}
      </div>

      {/* Case Timeline */}
      <div className="case-timeline-section">
        <h2>案件時間軸</h2>
        <div className="timeline">
          {(() => {
            const events: Array<{ time: string; label: string; type: string; detail?: string }> = [];
            events.push({ time: caseData.createdAt, label: '案件建立', type: 'created' });
            if (caseData.scheduledAt) events.push({ time: caseData.scheduledAt, label: '排程訪談', type: 'scheduled' });
            caseData.sessions.forEach(s => {
              events.push({ time: s.startedAt, label: `訪談 #${s.id} 開始`, type: 'session' });
              if (s.endedAt) {
                const dur = s.durationSeconds ? ` (${Math.round(s.durationSeconds / 60)} 分鐘)` : '';
                events.push({ time: s.endedAt, label: `訪談 #${s.id} 結束${dur}`, type: 'session' });
              }
            });
            caseData.prdVersions.forEach(v => {
              events.push({ time: v.createdAt, label: `PRD v${v.versionNumber} ${v.isLocked ? '鎖版' : '建立'}`, type: v.isLocked ? 'locked' : 'prd' });
            });
            // Add status changes from history
            statusHistory.forEach(h => {
              events.push({
                time: h.createdAt,
                label: `狀態變更: ${STATUS_LABELS[h.fromStatus || ''] || h.fromStatus || '–'} → ${STATUS_LABELS[h.toStatus] || h.toStatus}`,
                type: 'status_change',
                detail: h.userName || undefined,
              });
            });
            // Add comments
            comments.forEach(c => {
              events.push({
                time: c.createdAt,
                label: `留言`,
                type: 'comment',
                detail: `${c.userName}: ${c.content.slice(0, 60)}${c.content.length > 60 ? '...' : ''}`,
              });
            });
            if (caseData.completedAt) events.push({ time: caseData.completedAt, label: '案件結案', type: 'closed' });
            return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).map((e, i) => (
              <div key={i} className={`timeline-item timeline-${e.type}`}>
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <span className="timeline-label">{e.label}</span>
                  {e.detail && <span className="timeline-detail">{e.detail}</span>}
                  <span className="timeline-time">
                    {relativeTime(e.time)}
                    <span className="timeline-abs"> ({new Date(e.time).toLocaleString('zh-TW')})</span>
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Status Change History */}
      {statusHistory.length > 0 && (
        <div className="status-history-section">
          <h2>狀態變更紀錄 ({statusHistory.length})</h2>
          <div className="status-history-list">
            {statusHistory.map(h => (
              <div key={h.id} className="status-history-item">
                <div className="status-history-arrow">
                  <span className="status-history-from">{h.fromStatus ? (STATUS_LABELS[h.fromStatus] || h.fromStatus) : '-'}</span>
                  <span className="status-history-icon">&rarr;</span>
                  <span className="status-history-to">{STATUS_LABELS[h.toStatus] || h.toStatus}</span>
                </div>
                <div className="status-history-meta">
                  {h.userName && <span className="status-history-user">{h.userName}</span>}
                  <span className="status-history-time">{new Date(h.createdAt).toLocaleString('zh-TW')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Case Comments */}
      <div className="comments-section">
        <h2>團隊留言 ({comments.length})</h2>
        <div className="comment-form">
          <textarea
            className="comment-input"
            placeholder="輸入留言..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            rows={2}
            maxLength={2000}
          />
          <button className="btn-post-comment" onClick={postComment} disabled={postingComment || !newComment.trim()}>
            {postingComment ? '送出中...' : '送出留言'}
          </button>
        </div>
        {comments.length > 0 && (
          <div className="comment-list">
            {comments.map(c => (
              <div key={c.id} className="comment-item">
                <div className="comment-header">
                  <span className="comment-avatar">{c.userName?.charAt(0) || '?'}</span>
                  <span className="comment-author">{c.userName}</span>
                  <span className="comment-role">{c.userRole === 'admin' ? '管理員' : '顧問'}</span>
                  <span className="comment-time">{new Date(c.createdAt).toLocaleString('zh-TW')}</span>
                  <button className="comment-delete" onClick={() => deleteComment(c.id)} title="刪除">x</button>
                </div>
                <div className="comment-body">{c.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PRD Content Editor */}
      {Object.keys(prdSections).length > 0 && (
        <div className="prd-editor-section">
          <div className="prd-editor-header">
            <h2>PRD 內容</h2>
            <span className="completeness-badge">完成度 {prdCompleteness}%</span>
          </div>
          <div className="prd-editor-grid">
            {Object.entries(PRD_LABELS).map(([key, label]) => (
              <div key={key} className={`prd-edit-card ${prdSections[key] ? 'filled' : 'empty'}`}>
                <div className="prd-edit-card-header">
                  <h4>{label} {prdSections[key] ? '✓' : ''}</h4>
                  {prdSections[key] && !editingSection && hasUnlockedDraft && (
                    <button
                      className="btn-edit-sm"
                      onClick={() => { setEditingSection(key); setEditContent(prdSections[key]); }}
                    >
                      編輯
                    </button>
                  )}
                </div>
                {editingSection === key ? (
                  <div className="prd-edit-area">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={8}
                      className="prd-edit-textarea"
                    />
                    <div className="prd-edit-actions">
                      <button
                        className="btn-save-sm"
                        onClick={() => savePrdSection(key, editContent)}
                        disabled={savingPrd}
                      >
                        {savingPrd ? '儲存中...' : '儲存'}
                      </button>
                      <button
                        className="btn-cancel-sm"
                        onClick={() => { setEditingSection(null); setEditContent(''); }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : prdSections[key] ? (
                  <Markdown content={prdSections[key]} className="prd-edit-content" />
                ) : (
                  <p className="prd-edit-placeholder">尚未填入</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Floating Action Button */}
      <div className={`fab-wrapper ${fabOpen ? 'fab-open' : ''}`}>
        {fabOpen && (
          <div className="fab-actions">
            <button className="fab-action" onClick={() => { navigate(`/admin/cases/${id}/interview`); setFabOpen(false); }} title="開始訪談">
              <span className="fab-action-icon">💬</span>
              <span className="fab-action-label">開始訪談</span>
            </button>
            {prdSections && Object.keys(prdSections).length > 0 && (
              <button className="fab-action" onClick={() => {
                authFetch(`/api/cases/${id}/prd/export?format=md`).then(r => r.blob()).then(b => {
                  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
                  a.download = `prd_case_${id}.md`; a.click();
                });
                setFabOpen(false);
              }} title="匯出 PRD">
                <span className="fab-action-icon">📄</span>
                <span className="fab-action-label">匯出 PRD</span>
              </button>
            )}
            <button className="fab-action" onClick={() => {
              const shareUrl = `${window.location.origin}/api/cases/${id}/share-link`;
              authFetch(shareUrl).then(r => r.json()).then(d => {
                if (d.success) { navigator.clipboard.writeText(d.data.url); alert('分享連結已複製！'); }
              });
              setFabOpen(false);
            }} title="分享 PRD">
              <span className="fab-action-icon">🔗</span>
              <span className="fab-action-label">分享 PRD</span>
            </button>
            <button className="fab-action" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setFabOpen(false); }} title="回到頂部">
              <span className="fab-action-icon">⬆</span>
              <span className="fab-action-label">回到頂部</span>
            </button>
          </div>
        )}
        <button className="fab-btn" onClick={() => setFabOpen(!fabOpen)}>
          <span className={`fab-icon ${fabOpen ? 'fab-icon-close' : ''}`}>+</span>
        </button>
      </div>
    </div>
  );
}
