import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface CaseRow {
  id: number;
  leadId: number;
  status: string;
  priority: string;
  title: string;
  tags: string[] | null;
  isPinned: boolean;
  leadScore: number;
  consultantId: number | null;
  scheduledAt: string | null;
  createdAt: string;
  lead: Lead | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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

const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1',
  scheduled: '#f59e0b',
  interviewing: '#3b82f6',
  pending_review: '#8b5cf6',
  prd_draft: '#ec4899',
  prd_locked: '#10b981',
  mvp: '#f97316',
  closed: '#64748b',
};

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

// SLA targets in hours per status
const SLA_HOURS: Record<string, number> = {
  new: 24,        // Should move from new within 24h
  scheduled: 72,  // Should start interview within 72h
  interviewing: 48,  // Should complete interview within 48h
  pending_review: 24, // Should review within 24h
  prd_draft: 72,  // Should finalize PRD within 72h
};

export function DashboardPage() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [allCases, setAllCases] = useState<CaseRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicates, setDuplicates] = useState<Array<{ email: string; count: number }>>([]);
  const [analytics, setAnalytics] = useState<{
    totalSessions: number; avgSessionDuration: number; totalInterviewMinutes: number;
    totalMessages: number; avgMessagesPerSession: number; totalPrds: number;
    lockedPrds: number; prdLockRate: number;
    funnel: Record<string, number>;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState('');
  const [batchValue, setBatchValue] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageviewStats, setPageviewStats] = useState<{ total: number; today: number; thisWeek: number; uniqueToday: number } | null>(null);
  const [activityFeed, setActivityFeed] = useState<Array<{ id: number; type: string; caseId: number; detail: string; userName: string | null; createdAt: string }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('autoRefresh') === 'true');
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [consultants, setConsultants] = useState<Array<{ id: number; name: string; email: string; role: string }>>([]);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(() => (localStorage.getItem('viewMode') as 'table' | 'kanban') || 'table');
  const [dragCaseId, setDragCaseId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [priorityFilter, setPriorityFilter] = useState('');

  const fetchData = useCallback(async (page = 1, status = '', search = '', from = '', to = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const [casesRes, leadsRes, allCasesRes, dupesRes, analyticsRes, pvRes, feedRes, usersRes] = await Promise.all([
        authFetch(`/api/cases?${params}`),
        authFetch('/api/registrations'),
        authFetch('/api/cases?limit=100'),
        authFetch('/api/registrations/duplicates'),
        authFetch('/api/cases/analytics'),
        authFetch('/api/auth/pageview-stats'),
        authFetch('/api/cases/activity-feed'),
        authFetch('/api/auth/users'),
      ]);
      const casesData = await casesRes.json();
      const leadsData = await leadsRes.json();
      const allCasesData = await allCasesRes.json();

      if (casesData.success) {
        setCases(casesData.data);
        setPagination(casesData.pagination);
      }
      if (leadsData.success) {
        setLeads(leadsData.data);
      }
      if (allCasesData.success) {
        setAllCases(allCasesData.data);
      }
      const dupesData = await dupesRes.json();
      if (dupesData.success) {
        setDuplicates(dupesData.data);
      }
      const analyticsData = await analyticsRes.json();
      if (analyticsData.success) {
        setAnalytics(analyticsData.data);
      }
      const pvData = await pvRes.json();
      if (pvData.success) {
        setPageviewStats(pvData.data);
      }
      const feedData = await feedRes.json();
      if (feedData.success) {
        setActivityFeed(feedData.data);
      }
      const usersData = await usersRes.json();
      if (usersData.success) {
        setConsultants(usersData.data);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchData(1, statusFilter, searchQuery, dateFrom, dateTo);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('autoRefresh', autoRefresh ? 'true' : 'false');
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        fetchData(pagination.page, statusFilter, searchQuery, dateFrom, dateTo);
      }, 60000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, pagination.page, statusFilter, searchQuery, dateFrom, dateTo, fetchData]);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  const handleDrop = async (caseId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setCases(prev => prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c));
        setAllCases(prev => prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
    setDragCaseId(null);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    fetchData(1, status, searchQuery, dateFrom, dateTo);
  };

  const handlePageChange = (page: number) => {
    fetchData(page, statusFilter, searchQuery, dateFrom, dateTo);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchData(1, statusFilter, value, dateFrom, dateTo);
    }, 400);
  };

  const handleDateFilter = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    fetchData(1, statusFilter, searchQuery, from, to);
  };

  const handleBatchAction = async () => {
    if (selectedIds.size === 0 || !batchAction || !batchValue) return;
    setBatchProcessing(true);
    try {
      const value = batchAction === 'assign' ? parseInt(batchValue) : batchValue;
      const res = await authFetch('/api/cases/batch', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds), action: batchAction, value }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        setBatchAction('');
        setBatchValue('');
        fetchData(pagination.page, statusFilter, searchQuery, dateFrom, dateTo);
      } else {
        alert(data.message || '批次操作失敗');
      }
    } catch (err) {
      console.error('Batch action failed:', err);
    } finally {
      setBatchProcessing(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayCases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayCases.map(c => c.id)));
    }
  };

  const togglePin = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/cases/pin/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCases(prev => prev.map(c => c.id === id ? { ...c, isPinned: data.data.isPinned } : c));
        setAllCases(prev => prev.map(c => c.id === id ? { ...c, isPinned: data.data.isPinned } : c));
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleSendBulkEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      const leadIds = leads.map(l => l.id);
      const res = await authFetch('/api/registrations/bulk-email', {
        method: 'POST',
        body: JSON.stringify({ leadIds, subject: emailSubject.trim(), body: emailBody.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`郵件發送完成：成功 ${data.data.sent} / 失敗 ${data.data.failed}`);
        setEmailModalOpen(false);
        setEmailSubject('');
        setEmailBody('');
      } else {
        alert(data.message || '發送失敗');
      }
    } catch (err) {
      console.error('Bulk email failed:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  // Stats from all cases (not just current page)
  const totalLeads = leads.length;
  const today = new Date().toISOString().slice(0, 10);
  const todayLeads = leads.filter(l => l.createdAt.slice(0, 10) === today).length;
  const statusCounts: Record<string, number> = {};
  allCases.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
  const needCounts: Record<string, number> = {};
  leads.forEach(l => l.needTypes.forEach(n => { needCounts[n] = (needCounts[n] || 0) + 1; }));
  const topNeed = Object.entries(needCounts).sort((a, b) => b[1] - a[1])[0];
  const activeCases = (statusCounts['interviewing'] || 0) + (statusCounts['scheduled'] || 0) + (statusCounts['pending_review'] || 0);
  const completedCases = (statusCounts['prd_locked'] || 0) + (statusCounts['closed'] || 0);
  const conversionRate = totalLeads > 0 ? Math.round((completedCases / totalLeads) * 100) : 0;
  const lastLead = leads.length > 0 ? leads[0] : null;
  const timeSinceLastLead = lastLead ? (() => {
    const diff = Date.now() - new Date(lastLead.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    return `${Math.floor(hours / 24)} 天前`;
  })() : null;

  // Week-over-week comparison
  const now = new Date();
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 7);
  const lastWeekStart = new Date(now); lastWeekStart.setDate(now.getDate() - 14);
  const thisWeekLeads = leads.filter(l => new Date(l.createdAt) >= thisWeekStart).length;
  const lastWeekLeads = leads.filter(l => { const d = new Date(l.createdAt); return d >= lastWeekStart && d < thisWeekStart; }).length;
  const thisWeekCases = allCases.filter(c => new Date(c.createdAt) >= thisWeekStart).length;
  const lastWeekCases = allCases.filter(c => { const d = new Date(c.createdAt); return d >= lastWeekStart && d < thisWeekStart; }).length;
  const wowLeads = lastWeekLeads > 0 ? Math.round(((thisWeekLeads - lastWeekLeads) / lastWeekLeads) * 100) : (thisWeekLeads > 0 ? 100 : 0);
  const wowCases = lastWeekCases > 0 ? Math.round(((thisWeekCases - lastWeekCases) / lastWeekCases) * 100) : (thisWeekCases > 0 ? 100 : 0);

  // Activity log — combine recent leads + cases into a timeline
  const activities: Array<{ type: 'lead' | 'case' | 'scheduled'; text: string; time: string }> = [];
  leads.slice(0, 10).forEach(l => {
    activities.push({ type: 'lead', text: `${l.company} — ${l.contactName} 提交了諮詢報名`, time: l.createdAt });
  });
  allCases.forEach(c => {
    activities.push({ type: 'case', text: `案件「${c.lead?.company || c.title}」狀態: ${STATUS_LABELS[c.status] || c.status}`, time: c.createdAt });
    if (c.scheduledAt) {
      activities.push({ type: 'scheduled', text: `案件「${c.lead?.company || c.title}」已排程訪談`, time: c.scheduledAt });
    }
  });
  const recentActivities = activities
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);

  // Registration trends — last 14 days
  const trendDays = 14;
  const trendData: Array<{ date: string; label: string; count: number }> = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const count = leads.filter(l => l.createdAt.slice(0, 10) === dateStr).length;
    trendData.push({ date: dateStr, label, count });
  }
  const trendMax = Math.max(...trendData.map(d => d.count), 1);

  // Sparkline data — 7-day trends for stat cards
  const spark7 = (items: Array<{ createdAt: string }>) => {
    const data: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      data.push(items.filter(x => x.createdAt.slice(0, 10) === ds).length);
    }
    return data;
  };
  const leadsSparkline = spark7(leads);
  const casesSparkline = spark7(allCases);

  const Sparkline = ({ data, color = '#6366f1', width = 64, height = 24 }: { data: number[]; color?: string; width?: number; height?: number }) => {
    if (data.length === 0 || data.every(v => v === 0)) return null;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 2) - 1}`).join(' ');
    return (
      <svg width={width} height={height} className="sparkline" viewBox={`0 0 ${width} ${height}`}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    );
  };

  // SLA status calculator
  const getSlaStatus = (c: CaseRow): { label: string; color: string; overdue: boolean } | null => {
    const slaHours = SLA_HOURS[c.status];
    if (!slaHours) return null; // No SLA for closed, mvp, prd_locked
    const elapsed = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
    const remaining = slaHours - elapsed;
    if (remaining <= 0) {
      const overHours = Math.abs(Math.round(remaining));
      return { label: `逾期 ${overHours}h`, color: '#ef4444', overdue: true };
    }
    if (remaining < slaHours * 0.25) {
      return { label: `剩 ${Math.round(remaining)}h`, color: '#f59e0b', overdue: false };
    }
    return { label: `${Math.round(remaining)}h`, color: '#10b981', overdue: false };
  };

  // Sort toggle handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'createdAt' || field === 'leadScore' ? 'desc' : 'asc');
    }
  };

  const sortIndicator = (field: string) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // Server-side search — cases filtered by API + client priority filter, pinned first, then sorted
  const filteredCases = priorityFilter ? cases.filter(c => c.priority === priorityFilter) : cases;
  const displayCases = [...filteredCases].sort((a, b) => {
    // Pinned always first
    const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    // Apply custom sort
    if (!sortField) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'id': return (a.id - b.id) * dir;
      case 'company': return (a.lead?.company || a.title).localeCompare(b.lead?.company || b.title) * dir;
      case 'status': return (a.status.localeCompare(b.status)) * dir;
      case 'priority': {
        const order = { urgent: 0, high: 1, normal: 2, low: 3 };
        return ((order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2)) * dir;
      }
      case 'leadScore': return (a.leadScore - b.leadScore) * dir;
      case 'createdAt': return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      default: return 0;
    }
  });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>儀表板</h1>
        <div className="dashboard-header-actions">
          <button className="btn-bulk-email" onClick={() => setEmailModalOpen(true)}>群發郵件</button>
          <button className="btn-export-csv" onClick={() => {
            authFetch('/api/cases/export/csv').then(r => r.blob()).then(b => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(b);
              a.download = 'cases_export.csv'; a.click();
            });
          }}>匯出 CSV</button>
          <button className="btn-export-json" onClick={() => {
            authFetch('/api/cases/export/json').then(r => r.blob()).then(b => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(b);
              a.download = 'cases_export.json'; a.click();
            });
          }}>匯出 JSON</button>
          <button className="btn-export-report" onClick={() => {
            authFetch('/api/cases/export/report').then(r => r.blob()).then(b => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(b);
              a.download = 'analytics_report.txt'; a.click();
            });
          }}>匯出報告</button>
          <button className={`btn-auto-refresh ${autoRefresh ? 'active' : ''}`} onClick={() => setAutoRefresh(!autoRefresh)} title={autoRefresh ? '關閉自動更新' : '開啟自動更新（60秒）'}>
            {autoRefresh ? '自動更新 ON' : '自動更新'}
          </button>
          <button className="btn-refresh" onClick={() => fetchData(pagination.page, statusFilter, searchQuery, dateFrom, dateTo)}>
            重新整理
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <div>
              <div className="stat-label">總報名數</div>
              <div className="stat-value">{totalLeads}</div>
            </div>
            <Sparkline data={leadsSparkline} color="#6366f1" />
          </div>
          <div className="stat-sub-row">
            {todayLeads > 0 && <span className="stat-sub">今日 +{todayLeads}</span>}
            {wowLeads !== 0 && <span className={`stat-wow ${wowLeads > 0 ? 'wow-up' : 'wow-down'}`}>{wowLeads > 0 ? '+' : ''}{wowLeads}% 周比</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">進行中案件</div>
          <div className="stat-value">{activeCases}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <div>
              <div className="stat-label">案件總數</div>
              <div className="stat-value">{allCases.length}</div>
            </div>
            <Sparkline data={casesSparkline} color="#10b981" />
          </div>
          {wowCases !== 0 && <div className={`stat-wow ${wowCases > 0 ? 'wow-up' : 'wow-down'}`}>{wowCases > 0 ? '+' : ''}{wowCases}% 周比</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">最常見需求</div>
          <div className="stat-value stat-value-sm">{topNeed ? topNeed[0] : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">轉換率</div>
          <div className="stat-value">{conversionRate}%</div>
          <div className="stat-sub-row">
            <span className="stat-sub">{completedCases} 完成 / {totalLeads} 報名</span>
          </div>
        </div>
        {pageviewStats && (
          <div className="stat-card">
            <div className="stat-label">頁面瀏覽</div>
            <div className="stat-value">{pageviewStats.total}</div>
            <div className="stat-sub-row">
              {pageviewStats.today > 0 && <span className="stat-sub">今日 {pageviewStats.today}</span>}
              {pageviewStats.uniqueToday > 0 && <span className="stat-sub">獨立 {pageviewStats.uniqueToday}</span>}
            </div>
          </div>
        )}
        {timeSinceLastLead && (
          <div className="stat-card">
            <div className="stat-label">最近報名</div>
            <div className="stat-value stat-value-sm">{timeSinceLastLead}</div>
            {lastLead && <div className="stat-sub-row"><span className="stat-sub">{lastLead.company}</span></div>}
          </div>
        )}
      </div>

      {/* Interview Analytics */}
      {analytics && analytics.totalSessions > 0 && (
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-label">總訪談數</div>
            <div className="analytics-value">{analytics.totalSessions}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">總訪談時間</div>
            <div className="analytics-value">{analytics.totalInterviewMinutes} 分鐘</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">平均訪談長度</div>
            <div className="analytics-value">{Math.round(analytics.avgSessionDuration / 60)} 分鐘</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">平均訊息數/次</div>
            <div className="analytics-value">{analytics.avgMessagesPerSession}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">PRD 總數</div>
            <div className="analytics-value">{analytics.totalPrds}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">PRD 鎖版率</div>
            <div className="analytics-value">{analytics.prdLockRate}%</div>
          </div>
        </div>
      )}

      {/* Consultant Workload */}
      {consultants.length > 0 && allCases.length > 0 && (
        <div className="workload-section">
          <h2>顧問工作量</h2>
          <div className="workload-bars">
            {consultants.map(c => {
              const activeCasesCount = allCases.filter(
                cs => cs.consultantId === c.id && cs.status !== 'closed'
              ).length;
              const totalCasesCount = allCases.filter(cs => cs.consultantId === c.id).length;
              const maxCases = Math.max(...consultants.map(x => allCases.filter(cs => cs.consultantId === x.id).length), 1);
              const pct = maxCases > 0 ? Math.round((totalCasesCount / maxCases) * 100) : 0;
              return (
                <div key={c.id} className="workload-row">
                  <span className="workload-name">{c.name}</span>
                  <div className="workload-bar-bg">
                    <div className="workload-bar-fill" style={{ width: `${pct}%`, background: activeCasesCount > 5 ? '#ef4444' : activeCasesCount > 3 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <span className="workload-count">{activeCasesCount} 進行中 / {totalCasesCount} 總計</span>
                </div>
              );
            })}
            {(() => {
              const unassignedCount = allCases.filter(c => !c.consultantId && c.status !== 'closed').length;
              return unassignedCount > 0 ? (
                <div className="workload-row workload-unassigned">
                  <span className="workload-name">未分配</span>
                  <div className="workload-bar-bg">
                    <div className="workload-bar-fill" style={{ width: '100%', background: '#94a3b8' }} />
                  </div>
                  <span className="workload-count">{unassignedCount} 案件</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      {analytics && allCases.length > 0 && (
        <div className="funnel-section">
          <h2>案件轉換漏斗</h2>
          <div className="funnel-chart">
            {['new', 'scheduled', 'interviewing', 'pending_review', 'prd_draft', 'prd_locked', 'closed'].map(status => {
              const count = analytics.funnel[status] || 0;
              const pct = allCases.length > 0 ? Math.round((count / allCases.length) * 100) : 0;
              return (
                <div key={status} className="funnel-row">
                  <span className="funnel-label">{STATUS_LABELS[status]}</span>
                  <div className="funnel-bar-bg">
                    <div
                      className="funnel-bar-fill"
                      style={{ width: `${pct}%`, background: STATUS_COLORS[status] }}
                    />
                  </div>
                  <span className="funnel-count">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Registration Trends */}
      {leads.length > 0 && (
        <div className="trends-section">
          <h2>報名趨勢（近 14 天）</h2>
          <div className="trends-chart">
            {trendData.map(d => (
              <div key={d.date} className="trends-bar-col">
                <span className="trends-bar-count">{d.count || ''}</span>
                <div
                  className="trends-bar"
                  style={{ height: `${(d.count / trendMax) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                />
                <span className="trends-bar-label">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate Leads Warning */}
      {duplicates.length > 0 && (
        <div className="duplicate-warning">
          <div className="duplicate-warning-header">重複報名提醒</div>
          <div className="duplicate-warning-list">
            {duplicates.map(d => (
              <span key={d.email} className="duplicate-item">{d.email} ({d.count} 次)</span>
            ))}
          </div>
        </div>
      )}

      {/* Assignment Queue */}
      {(() => {
        const unassigned = allCases
          .filter(c => !c.consultantId && c.status !== 'closed')
          .sort((a, b) => {
            const priOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
            const priDiff = (priOrder[a.priority] ?? 2) - (priOrder[b.priority] ?? 2);
            if (priDiff !== 0) return priDiff;
            return b.leadScore - a.leadScore;
          });
        return unassigned.length > 0 ? (
          <div className="queue-section">
            <h2>待分配案件 ({unassigned.length})</h2>
            <div className="queue-cards">
              {unassigned.slice(0, 6).map(c => (
                <div key={c.id} className="queue-card" onClick={() => navigate(`/admin/cases/${c.id}`)}>
                  <div className="queue-card-top">
                    <span className="queue-card-id">#{c.id}</span>
                    <span className="priority-badge" style={{ color: PRIORITY_COLORS[c.priority], borderColor: PRIORITY_COLORS[c.priority] }}>
                      {PRIORITY_LABELS[c.priority]}
                    </span>
                    <span className={`lead-score-badge ${c.leadScore >= 70 ? 'score-high' : c.leadScore >= 40 ? 'score-mid' : 'score-low'}`}>
                      {c.leadScore}
                    </span>
                  </div>
                  <div className="queue-card-company">{c.lead?.company || c.title}</div>
                  <div className="queue-card-meta">
                    <span className="status-badge" style={{ background: STATUS_COLORS[c.status] }}>{STATUS_LABELS[c.status]}</span>
                    <span className="queue-card-date">{new Date(c.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* Status Distribution */}
      <div className="status-distribution">
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const count = statusCounts[key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              className={`status-dist-item ${statusFilter === key ? 'active' : ''}`}
              onClick={() => handleStatusFilter(statusFilter === key ? '' : key)}
            >
              <span className="status-dist-dot" style={{ background: STATUS_COLORS[key] }} />
              <span className="status-dist-label">{label}</span>
              <span className="status-dist-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Unified Activity Feed */}
      {(activityFeed.length > 0 || recentActivities.length > 0) && (
        <div className="activity-log">
          <h2>近期動態</h2>
          <ul className="activity-list">
            {activityFeed.length > 0 ? activityFeed.map((a) => (
              <li key={`${a.type}-${a.id}`} className={`activity-item activity-${a.type}`} onClick={() => a.caseId && navigate(`/admin/cases/${a.caseId}`)}>
                <span className={`activity-dot activity-dot-${a.type}`} />
                <span className="activity-text">
                  {a.type === 'status_change' && `狀態變更: ${a.detail}`}
                  {a.type === 'comment' && `留言: ${a.detail}`}
                  {a.type === 'new_case' && `新案件: ${a.detail}`}
                  {a.userName && <span className="activity-user"> — {a.userName}</span>}
                </span>
                <span className="activity-time">{new Date(a.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            )) : recentActivities.map((a, i) => (
              <li key={i} className={`activity-item activity-${a.type}`}>
                <span className={`activity-dot activity-dot-${a.type}`} />
                <span className="activity-text">{a.text}</span>
                <span className="activity-time">{new Date(a.time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-section">
        <div className="table-toolbar">
          <h2>案件列表</h2>
          <div className="table-toolbar-right">
            <div className="view-toggle">
              <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')} title="表格檢視">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="3" rx="0.5"/><rect x="1" y="6" width="14" height="3" rx="0.5"/><rect x="1" y="11" width="14" height="3" rx="0.5"/></svg>
              </button>
              <button className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')} title="看板檢視">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="3" height="14" rx="0.5"/><rect x="6" y="1" width="3" height="10" rx="0.5"/><rect x="11" y="1" width="3" height="12" rx="0.5"/></svg>
              </button>
            </div>
            <input
              className="search-input"
              type="text"
              placeholder="搜尋公司 / 聯絡人 / Email..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
            />
            <div className="date-range-filter">
              <div className="date-presets">
                {[
                  { label: '今日', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                  { label: '本週', from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })(), to: new Date().toISOString().slice(0, 10) },
                  { label: '本月', from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                  { label: '近30天', from: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })(), to: new Date().toISOString().slice(0, 10) },
                ].map(p => (
                  <button key={p.label} className={`date-preset-chip ${dateFrom === p.from && dateTo === p.to ? 'active' : ''}`} onClick={() => handleDateFilter(p.from, p.to)}>{p.label}</button>
                ))}
              </div>
              <input
                type="date"
                className="date-input"
                value={dateFrom}
                onChange={e => handleDateFilter(e.target.value, dateTo)}
                placeholder="起始日期"
              />
              <span className="date-range-sep">~</span>
              <input
                type="date"
                className="date-input"
                value={dateTo}
                onChange={e => handleDateFilter(dateFrom, e.target.value)}
                placeholder="結束日期"
              />
              {(dateFrom || dateTo) && (
                <button className="btn-clear-dates" onClick={() => handleDateFilter('', '')}>清除</button>
              )}
            </div>
          </div>
        </div>
        <div className="table-toolbar">
          <div className="status-filters">
            <button className={`filter-chip ${statusFilter === '' ? 'active' : ''}`} onClick={() => handleStatusFilter('')}>全部</button>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <button key={key} className={`filter-chip ${statusFilter === key ? 'active' : ''}`} onClick={() => handleStatusFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="priority-filters">
            <span className="filter-group-label">優先度:</span>
            <button className={`filter-chip filter-chip-priority ${priorityFilter === '' ? 'active' : ''}`} onClick={() => setPriorityFilter('')}>全部</button>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={`filter-chip filter-chip-priority ${priorityFilter === key ? 'active' : ''}`}
                style={priorityFilter === key ? { borderColor: PRIORITY_COLORS[key], color: PRIORITY_COLORS[key] } : undefined}
                onClick={() => setPriorityFilter(priorityFilter === key ? '' : key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Batch Actions Toolbar */}
        {selectedIds.size > 0 && (
          <div className="batch-toolbar">
            <span className="batch-count">已選 {selectedIds.size} 筆</span>
            <select className="batch-select" value={batchAction} onChange={e => { setBatchAction(e.target.value); setBatchValue(''); }}>
              <option value="">選擇操作...</option>
              <option value="status">變更狀態</option>
              <option value="priority">變更優先度</option>
            </select>
            {batchAction === 'status' && (
              <select className="batch-select" value={batchValue} onChange={e => setBatchValue(e.target.value)}>
                <option value="">選擇狀態...</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            {batchAction === 'priority' && (
              <select className="batch-select" value={batchValue} onChange={e => setBatchValue(e.target.value)}>
                <option value="">選擇優先度...</option>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <button className="btn-batch-apply" onClick={handleBatchAction} disabled={batchProcessing || !batchAction || !batchValue}>
              {batchProcessing ? '處理中...' : '套用'}
            </button>
            <button className="btn-batch-cancel" onClick={() => { setSelectedIds(new Set()); setBatchAction(''); setBatchValue(''); }}>取消</button>
          </div>
        )}

        {loading ? (
          <div className="table-loading">載入中...</div>
        ) : displayCases.length === 0 ? (
          <div className="table-empty">{(searchQuery || dateFrom || dateTo || statusFilter) ? '沒有符合的搜尋結果' : '目前沒有案件'}</div>
        ) : viewMode === 'kanban' ? (
          <div className="kanban-board">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const columnCases = displayCases.filter(c => c.status === status);
              return (
                <div
                  key={status}
                  className={`kanban-column ${dragCaseId !== null ? 'kanban-drop-target' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('kanban-column-hover'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('kanban-column-hover'); }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('kanban-column-hover'); if (dragCaseId !== null) handleDrop(dragCaseId, status); }}
                >
                  <div className="kanban-column-header">
                    <span className="kanban-column-dot" style={{ background: STATUS_COLORS[status] }} />
                    <span className="kanban-column-title">{label}</span>
                    <span className="kanban-column-count">{columnCases.length}</span>
                  </div>
                  <div className="kanban-column-body">
                    {columnCases.map(c => (
                      <div
                        key={c.id}
                        className={`kanban-card ${c.isPinned ? 'kanban-card-pinned' : ''}`}
                        draggable
                        onDragStart={() => setDragCaseId(c.id)}
                        onDragEnd={() => setDragCaseId(null)}
                        onClick={() => navigate(`/admin/cases/${c.id}`)}
                      >
                        <div className="kanban-card-header">
                          <span className="kanban-card-id">#{c.id}</span>
                          {c.isPinned && <span className="kanban-card-pin" title="已釘選">{'\u2605'}</span>}
                          <span className={`lead-score-badge ${c.leadScore >= 70 ? 'score-high' : c.leadScore >= 40 ? 'score-mid' : 'score-low'}`}>{c.leadScore}</span>
                        </div>
                        <div className="kanban-card-title">{c.lead?.company || c.title}</div>
                        {c.lead?.contactName && <div className="kanban-card-contact">{c.lead.contactName}</div>}
                        <div className="kanban-card-footer">
                          <span className="priority-badge" style={{ color: PRIORITY_COLORS[c.priority] || '#94a3b8', borderColor: PRIORITY_COLORS[c.priority] || '#94a3b8' }}>
                            {PRIORITY_LABELS[c.priority] || c.priority}
                          </span>
                          <span className="kanban-card-date">{new Date(c.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="th-check"><input type="checkbox" checked={selectedIds.size === displayCases.length && displayCases.length > 0} onChange={toggleSelectAll} /></th>
                    <th className="th-pin"></th>
                    <th className="th-sortable" onClick={() => handleSort('id')}>#{sortIndicator('id')}</th>
                    <th className="th-sortable" onClick={() => handleSort('company')}>公司{sortIndicator('company')}</th>
                    <th>聯絡人</th>
                    <th className="th-sortable" onClick={() => handleSort('status')}>狀態{sortIndicator('status')}</th>
                    <th className="th-sortable" onClick={() => handleSort('priority')}>優先度{sortIndicator('priority')}</th>
                    <th>需求類型</th>
                    <th className="th-sortable" onClick={() => handleSort('leadScore')}>評分{sortIndicator('leadScore')}</th>
                    <th>SLA</th>
                    <th className="th-sortable" onClick={() => handleSort('createdAt')}>建立時間{sortIndicator('createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCases.map((c, i) => (
                    <tr key={c.id} className={`clickable-row ${selectedIds.has(c.id) ? 'row-selected' : ''} ${c.isPinned ? 'row-pinned' : ''}`}>
                      <td className="td-check" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                      </td>
                      <td className="td-pin">
                        <button className={`btn-pin ${c.isPinned ? 'pinned' : ''}`} onClick={(e) => togglePin(c.id, e)} title={c.isPinned ? '取消釘選' : '釘選'}>
                          {c.isPinned ? '\u2605' : '\u2606'}
                        </button>
                      </td>
                      <td onClick={() => navigate(`/admin/cases/${c.id}`)}>{(pagination.page - 1) * pagination.limit + i + 1}</td>
                      <td className="cell-company" onClick={() => navigate(`/admin/cases/${c.id}`)}>
                        {c.lead?.company || c.title}
                        {c.lead && <button className="btn-preview-lead" onClick={(e) => { e.stopPropagation(); setPreviewLead(c.lead); }} title="快速查看">i</button>}
                      </td>
                      <td>
                        <div>{c.lead?.contactName}</div>
                        {c.lead?.title && <div className="cell-subtitle">{c.lead.title}</div>}
                      </td>
                      <td>
                        <span className="status-badge" style={{ background: STATUS_COLORS[c.status] || '#64748b' }}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </td>
                      <td>
                        <span className="priority-badge" style={{ color: PRIORITY_COLORS[c.priority] || '#94a3b8', borderColor: PRIORITY_COLORS[c.priority] || '#94a3b8' }}>
                          {PRIORITY_LABELS[c.priority] || c.priority}
                        </span>
                      </td>
                      <td>
                        <div className="need-tags">
                          {c.lead?.needTypes.map(n => <span key={n} className="need-tag">{n}</span>)}
                        </div>
                        {c.tags && c.tags.length > 0 && (
                          <div className="case-tags-row">
                            {c.tags.map(t => <span key={t} className="case-tag">{t}</span>)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`lead-score-badge ${c.leadScore >= 70 ? 'score-high' : c.leadScore >= 40 ? 'score-mid' : 'score-low'}`}>
                          {c.leadScore}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const sla = getSlaStatus(c);
                          if (!sla) return <span className="sla-badge sla-na">—</span>;
                          return <span className={`sla-badge ${sla.overdue ? 'sla-overdue' : ''}`} style={{ color: sla.color }}>{sla.label}</span>;
                        })()}
                      </td>
                      <td className="cell-time">
                        {new Date(c.createdAt).toLocaleDateString('zh-TW')}<br />
                        <span className="cell-time-detail">{new Date(c.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button disabled={pagination.page <= 1} onClick={() => handlePageChange(pagination.page - 1)}>上一頁</button>
                <span>第 {pagination.page} / {pagination.totalPages} 頁（共 {pagination.total} 筆）</span>
                <button disabled={pagination.page >= pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)}>下一頁</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lead Preview Modal */}
      {previewLead && (
        <div className="lead-preview-overlay" onClick={() => setPreviewLead(null)}>
          <div className="lead-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="lead-preview-header">
              <h2>{previewLead.company}</h2>
              <button className="lead-preview-close" onClick={() => setPreviewLead(null)}>x</button>
            </div>
            <div className="lead-preview-body">
              <div className="lead-preview-field"><span className="lead-preview-label">聯絡人</span><span>{previewLead.contactName}</span></div>
              {previewLead.title && <div className="lead-preview-field"><span className="lead-preview-label">職稱</span><span>{previewLead.title}</span></div>}
              <div className="lead-preview-field"><span className="lead-preview-label">Email</span><span>{previewLead.email}</span></div>
              <div className="lead-preview-field"><span className="lead-preview-label">電話</span><span>{previewLead.phone}</span></div>
              <div className="lead-preview-field"><span className="lead-preview-label">公司規模</span><span>{previewLead.companySize}</span></div>
              <div className="lead-preview-field">
                <span className="lead-preview-label">需求類型</span>
                <div className="need-tags">{previewLead.needTypes.map(n => <span key={n} className="need-tag">{n}</span>)}</div>
              </div>
              {previewLead.description && <div className="lead-preview-field lead-preview-full"><span className="lead-preview-label">補充說明</span><p>{previewLead.description}</p></div>}
              <div className="lead-preview-field"><span className="lead-preview-label">報名時間</span><span>{new Date(previewLead.createdAt).toLocaleString('zh-TW')}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Email Modal */}
      {emailModalOpen && (
        <div className="email-modal-overlay" onClick={() => setEmailModalOpen(false)}>
          <div className="email-modal" onClick={e => e.stopPropagation()}>
            <div className="email-modal-header">
              <h2>群發郵件</h2>
              <button className="email-modal-close" onClick={() => setEmailModalOpen(false)}>x</button>
            </div>
            <div className="email-modal-body">
              <p className="email-modal-hint">將發送給所有 {leads.length} 位報名者。可使用 {'{{name}}'} 插入收件者姓名。</p>
              <label className="email-label">主旨</label>
              <input
                className="email-input"
                type="text"
                placeholder="郵件主旨..."
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
              />
              <label className="email-label">內容（支援 HTML）</label>
              <textarea
                className="email-textarea"
                placeholder="<p>{{name}} 您好，...</p>"
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={8}
              />
            </div>
            <div className="email-modal-footer">
              <button className="btn-cancel-sm" onClick={() => setEmailModalOpen(false)}>取消</button>
              <button
                className="btn-send-email"
                onClick={handleSendBulkEmail}
                disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
              >
                {sendingEmail ? '發送中...' : `發送給 ${leads.length} 人`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
