import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { Markdown } from '../components/Markdown';

interface Transcript {
  id: number;
  speaker: 'consultant' | 'agent' | 'client';
  content: string;
  sequenceNumber: number;
  createdAt: string;
}

interface SessionDetail {
  id: number;
  caseId: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  transcripts: Transcript[];
}

const SPEAKER_LABELS: Record<string, string> = {
  consultant: '顧問',
  agent: 'AI',
  client: '客戶',
};

const SPEAKER_AVATARS: Record<string, string> = {
  consultant: '👤',
  agent: '🤖',
  client: '🏢',
};

export function TranscriptPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const res = await authFetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        if (data.success) setSession(data.data);
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, authFetch]);

  const filtered = useMemo(() => {
    if (!session) return [];
    let items = session.transcripts;
    if (speakerFilter) items = items.filter(t => t.speaker === speakerFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(t => t.content.toLowerCase().includes(q));
    }
    return items;
  }, [session, searchQuery, speakerFilter]);

  if (loading) return <div className="admin-loading">載入中...</div>;
  if (!session) return <div className="admin-loading">找不到訪談記錄</div>;

  const duration = session.durationSeconds
    ? `${Math.floor(session.durationSeconds / 60)} 分 ${session.durationSeconds % 60} 秒`
    : '進行中';

  // Speaker stats
  const speakerCounts: Record<string, number> = {};
  session.transcripts.forEach(t => { speakerCounts[t.speaker] = (speakerCounts[t.speaker] || 0) + 1; });

  return (
    <div className="transcript-page">
      <button className="btn-back-link" onClick={() => navigate(-1)}>← 返回</button>

      <div className="transcript-header">
        <div className="transcript-title-row">
          <h1>訪談逐字稿</h1>
          {session.transcripts.length > 0 && (
            <button className="btn-export-md" onClick={() => {
              authFetch(`/api/sessions/${sessionId}/export`).then(r => r.blob()).then(b => {
                const a = document.createElement('a'); a.href = URL.createObjectURL(b);
                a.download = `transcript_session_${sessionId}.md`; a.click();
              });
            }}>匯出 Markdown</button>
          )}
        </div>
        <div className="transcript-meta">
          <span>Session #{session.id}</span>
          <span>{new Date(session.startedAt).toLocaleString('zh-TW')}</span>
          <span>時長: {duration}</span>
          <span>{session.transcripts.length} 則訊息</span>
        </div>

        {/* Speaker stats */}
        <div className="transcript-stats">
          {Object.entries(speakerCounts).map(([speaker, count]) => (
            <span key={speaker} className={`transcript-stat speaker-${speaker}`}>
              {SPEAKER_AVATARS[speaker]} {SPEAKER_LABELS[speaker]}: {count} 則
            </span>
          ))}
        </div>
      </div>

      {/* Search & Filter */}
      {session.transcripts.length > 0 && (
        <div className="transcript-toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="搜尋對話內容..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="transcript-filters">
            <button className={`filter-chip ${speakerFilter === '' ? 'active' : ''}`} onClick={() => setSpeakerFilter('')}>全部</button>
            {Object.entries(SPEAKER_LABELS).map(([key, label]) => (
              <button key={key} className={`filter-chip ${speakerFilter === key ? 'active' : ''}`} onClick={() => setSpeakerFilter(speakerFilter === key ? '' : key)}>
                {SPEAKER_AVATARS[key]} {label}
              </button>
            ))}
          </div>
          {searchQuery && <div className="transcript-search-count">找到 {filtered.length} 則符合的訊息</div>}
        </div>
      )}

      <div className="transcript-list">
        {session.transcripts.length === 0 ? (
          <div className="transcript-empty">此訪談尚無對話記錄</div>
        ) : filtered.length === 0 ? (
          <div className="transcript-empty">沒有符合的搜尋結果</div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className={`transcript-item transcript-${t.speaker}`}>
              <div className="transcript-avatar">{SPEAKER_AVATARS[t.speaker]}</div>
              <div className="transcript-bubble">
                <div className="transcript-speaker">
                  <span className={`speaker-badge speaker-${t.speaker}`}>
                    {SPEAKER_LABELS[t.speaker] || t.speaker}
                  </span>
                  <span className="transcript-time">
                    {new Date(t.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="transcript-seq">#{t.sequenceNumber}</span>
                </div>
                <div className="transcript-content">
                  {t.speaker === 'agent' ? (
                    <Markdown content={t.content} />
                  ) : (
                    <p>{t.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
