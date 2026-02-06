import React, { useEffect, useState } from 'react';
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

export function TranscriptPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="admin-loading">載入中...</div>;
  if (!session) return <div className="admin-loading">找不到訪談記錄</div>;

  const duration = session.durationSeconds
    ? `${Math.floor(session.durationSeconds / 60)} 分 ${session.durationSeconds % 60} 秒`
    : '進行中';

  return (
    <div className="transcript-page">
      <button className="btn-back-link" onClick={() => navigate(-1)}>← 返回</button>

      <div className="transcript-header">
        <h1>訪談逐字稿</h1>
        <div className="transcript-meta">
          <span>Session #{session.id}</span>
          <span>{new Date(session.startedAt).toLocaleString('zh-TW')}</span>
          <span>時長: {duration}</span>
          <span>{session.transcripts.length} 則訊息</span>
        </div>
      </div>

      <div className="transcript-list">
        {session.transcripts.length === 0 ? (
          <div className="transcript-empty">此訪談尚無對話記錄</div>
        ) : (
          session.transcripts.map((t) => (
            <div key={t.id} className={`transcript-item transcript-${t.speaker}`}>
              <div className="transcript-speaker">
                <span className={`speaker-badge speaker-${t.speaker}`}>
                  {SPEAKER_LABELS[t.speaker] || t.speaker}
                </span>
                <span className="transcript-time">
                  {new Date(t.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="transcript-content">
                {t.speaker === 'agent' ? (
                  <Markdown content={t.content} />
                ) : (
                  <p>{t.content}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
