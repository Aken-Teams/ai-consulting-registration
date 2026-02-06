import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth-context';

interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

interface PrdData {
  content: {
    sections: Record<string, string>;
    metadata?: { completeness?: number };
  };
}

interface Summary {
  summary: string;
  keyDecisions?: string[];
  openQuestions?: string[];
}

const PRD_LABELS: Record<string, string> = {
  background: '背景與目標', users: '使用者與情境', scope: '需求範圍',
  asIs: '現況流程', toBe: '目標流程', userStories: '功能需求',
  acceptance: '驗收標準', dataModel: '資料與欄位', permissions: '權限與角色',
  nonFunctional: '非功能需求', kpi: '成功指標', risks: '風險與依賴',
  mvpScope: 'MVP 切分建議',
};

export function InterviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { token, authFetch } = useAuth();
  const navigate = useNavigate();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agentTyping, setAgentTyping] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [prd, setPrd] = useState<PrdData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leadInfo, setLeadInfo] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Load case info and create session
  useEffect(() => {
    if (!caseId || !token) return;

    (async () => {
      // Fetch case detail
      const res = await authFetch(`/api/cases/${caseId}`);
      const data = await res.json();
      if (data.success) {
        setLeadInfo(data.data.lead);
      }

      // Fetch existing PRD
      const prdRes = await authFetch(`/api/cases/${caseId}/prd`);
      const prdData = await prdRes.json();
      if (prdData.success && prdData.data) {
        setPrd(prdData.data);
      }

      // Create new session
      const sessRes = await authFetch(`/api/cases/${caseId}/sessions`, { method: 'POST' });
      const sessData = await sessRes.json();
      if (sessData.success) {
        setSessionId(sessData.data.id);
      }
    })();
  }, [caseId, token, authFetch]);

  // Setup Socket.IO
  useEffect(() => {
    if (!sessionId || !token || !caseId) return;

    const s = io(window.location.origin);

    s.on('connect', () => {
      s.emit('auth', token, (ok: boolean) => {
        if (ok) {
          s.emit('joinSession', { sessionId, caseId: parseInt(caseId) });
        }
      });
    });

    s.on('sessionJoined', () => setConnected(true));

    s.on('message', (msg: Message) => {
      setStreamingText('');
      setMessages(prev => [...prev, msg]);
    });

    s.on('agentTyping', (typing: boolean) => {
      setAgentTyping(typing);
      if (typing) setStreamingText('');
    });

    s.on('agentStream', (data: { chunk: string }) => {
      setStreamingText(prev => prev + data.chunk);
    });

    s.on('prdUpdated', () => {
      // Reload PRD
      authFetch(`/api/cases/${caseId}/prd`).then(r => r.json()).then(d => {
        if (d.success && d.data) setPrd(d.data);
      });
    });

    s.on('agentSummary', (data: Summary) => setSummary(data));

    s.on('error', (data: { message: string }) => {
      console.error('[Socket] Error:', data.message);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, [sessionId, token, caseId, authFetch]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || !socket || !connected) return;
    socket.emit('chatMessage', { message: input.trim() });
    setInput('');
    inputRef.current?.focus();
  }, [input, socket, connected]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const endSession = async () => {
    if (sessionId) {
      await authFetch(`/api/sessions/${sessionId}`, { method: 'PATCH' });
      socket?.disconnect();
      navigate(`/admin/cases/${caseId}`);
    }
  };

  const completeness = prd?.content?.metadata?.completeness || 0;
  const sections = prd?.content?.sections || {};

  return (
    <div className="interview-page">
      <div className="interview-header">
        <button className="btn-back-link" onClick={() => navigate(`/admin/cases/${caseId}`)}>← 返回案件</button>
        <h1>訪談工作台</h1>
        <div className="interview-header-right">
          <span className="completeness-badge">PRD {completeness}%</span>
          <button className="btn-end-session" onClick={endSession}>結束訪談</button>
        </div>
      </div>

      <div className="interview-layout">
        {/* Left: Lead info + Summary */}
        <aside className="interview-sidebar">
          {leadInfo && (
            <div className="sidebar-section">
              <h3>客戶資訊</h3>
              <div className="info-item"><span>公司</span>{leadInfo.company}</div>
              <div className="info-item"><span>聯絡人</span>{leadInfo.contactName}</div>
              <div className="info-item"><span>規模</span>{leadInfo.companySize}</div>
              <div className="info-item"><span>需求</span>{leadInfo.needTypes?.join('、')}</div>
              {leadInfo.description && <div className="info-item info-desc"><span>描述</span>{leadInfo.description}</div>}
            </div>
          )}
          {summary && (
            <div className="sidebar-section">
              <h3>對話摘要</h3>
              <p className="summary-text">{summary.summary}</p>
              {summary.keyDecisions && summary.keyDecisions.length > 0 && (
                <>
                  <h4>已確認決定</h4>
                  <ul>{summary.keyDecisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </>
              )}
              {summary.openQuestions && summary.openQuestions.length > 0 && (
                <>
                  <h4>待釐清問題</h4>
                  <ul>{summary.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </aside>

        {/* Center: Chat */}
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && !agentTyping && (
              <div className="chat-empty">
                <p>訪談已開始，請輸入訊息與 AI 顧問開始對話。</p>
                <p>AI 會根據客戶的報名資訊，引導您逐步完成 PRD。</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-msg-avatar">{msg.role === 'user' ? '顧' : 'AI'}</div>
                <div className="chat-msg-body">
                  <div className="chat-msg-content">{msg.content}</div>
                  <div className="chat-msg-time">{new Date(msg.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
            {agentTyping && streamingText && (
              <div className="chat-msg chat-msg-agent">
                <div className="chat-msg-avatar">AI</div>
                <div className="chat-msg-body">
                  <div className="chat-msg-content">{streamingText}<span className="typing-cursor">|</span></div>
                </div>
              </div>
            )}
            {agentTyping && !streamingText && (
              <div className="chat-msg chat-msg-agent">
                <div className="chat-msg-avatar">AI</div>
                <div className="chat-msg-body"><div className="chat-msg-content typing-dots">思考中...</div></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-area">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息... (Enter 送出, Shift+Enter 換行)"
              rows={2}
              disabled={!connected || agentTyping}
            />
            <button onClick={sendMessage} disabled={!input.trim() || !connected || agentTyping} className="btn-send">
              送出
            </button>
          </div>
        </div>

        {/* Right: PRD Preview */}
        <aside className="prd-panel">
          <div className="prd-panel-header">
            <h3>PRD 即時預覽</h3>
            <span className="completeness-bar">
              <span style={{ width: `${completeness}%` }} />
            </span>
          </div>
          <div className="prd-sections">
            {Object.entries(PRD_LABELS).map(([key, label]) => (
              <div key={key} className={`prd-section ${sections[key] ? 'filled' : 'empty'}`}>
                <h4>{label} {sections[key] ? '✓' : ''}</h4>
                {sections[key] ? (
                  <div className="prd-section-content">{sections[key]}</div>
                ) : (
                  <div className="prd-section-placeholder">等待訪談填入...</div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
