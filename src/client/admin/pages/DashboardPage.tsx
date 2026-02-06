import React, { useEffect, useState, useCallback } from 'react';
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
  title: string;
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

export function DashboardPage() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [allCases, setAllCases] = useState<CaseRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (page = 1, status = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);

      const [casesRes, leadsRes, allCasesRes] = await Promise.all([
        authFetch(`/api/cases?${params}`),
        authFetch('/api/registrations'),
        authFetch('/api/cases?limit=100'),
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
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchData(pagination.page, statusFilter);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setSearchQuery('');
    fetchData(1, status);
  };

  const handlePageChange = (page: number) => {
    fetchData(page, statusFilter);
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

  // Client-side search filtering
  const displayCases = searchQuery.trim()
    ? cases.filter(c => {
        const q = searchQuery.trim().toLowerCase();
        return (c.lead?.company || '').toLowerCase().includes(q)
          || (c.lead?.contactName || '').toLowerCase().includes(q)
          || (c.lead?.email || '').toLowerCase().includes(q)
          || c.title.toLowerCase().includes(q);
      })
    : cases;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>儀表板</h1>
        <button className="btn-refresh" onClick={() => fetchData(pagination.page, statusFilter)}>
          重新整理
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">總報名數</div>
          <div className="stat-value">{totalLeads}</div>
          {todayLeads > 0 && <div className="stat-sub">今日 +{todayLeads}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">進行中案件</div>
          <div className="stat-value">{activeCases}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">案件總數</div>
          <div className="stat-value">{allCases.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最常見需求</div>
          <div className="stat-value stat-value-sm">{topNeed ? topNeed[0] : '-'}</div>
        </div>
      </div>

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

      <div className="table-section">
        <div className="table-toolbar">
          <h2>案件列表</h2>
          <div className="table-toolbar-right">
            <input
              className="search-input"
              type="text"
              placeholder="搜尋公司 / 聯絡人..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
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
        </div>

        {loading ? (
          <div className="table-loading">載入中...</div>
        ) : displayCases.length === 0 ? (
          <div className="table-empty">{searchQuery ? '沒有符合的搜尋結果' : '目前沒有案件'}</div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>公司</th>
                    <th>聯絡人</th>
                    <th>狀態</th>
                    <th>需求類型</th>
                    <th>建立時間</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCases.map((c, i) => (
                    <tr key={c.id} onClick={() => navigate(`/admin/cases/${c.id}`)} className="clickable-row">
                      <td>{(pagination.page - 1) * pagination.limit + i + 1}</td>
                      <td className="cell-company">{c.lead?.company || c.title}</td>
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
                        <div className="need-tags">
                          {c.lead?.needTypes.map(n => <span key={n} className="need-tag">{n}</span>)}
                        </div>
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
    </div>
  );
}
