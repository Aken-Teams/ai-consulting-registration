import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth-context';
import { Markdown } from '../components/Markdown';

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
  const [sttEnabled, setSttEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sttProcessing, setSttProcessing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

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

    const s = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const joinSession = () => {
      s.emit('auth', token, (ok: boolean) => {
        if (ok) {
          s.emit('joinSession', { sessionId, caseId: parseInt(caseId) });
        }
      });
    };

    s.on('connect', joinSession);

    s.on('disconnect', () => setConnected(false));
    s.on('reconnect', joinSession);

    s.on('sessionJoined', (data: { sessionId: number; sttAvailable: boolean }) => {
      setConnected(true);
      setSttEnabled(data.sttAvailable);
    });

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
      authFetch(`/api/cases/${caseId}/prd`).then(r => r.json()).then(d => {
        if (d.success && d.data) setPrd(d.data);
      });
    });

    s.on('agentSummary', (data: Summary) => setSummary(data));

    s.on('sttProcessing', (processing: boolean) => setSttProcessing(processing));

    s.on('sttResult', (data: { text: string | null; error?: string }) => {
      setSttProcessing(false);
      if (data.text) {
        setInput(prev => prev ? prev + ' ' + data.text : data.text);
        inputRef.current?.focus();
      } else if (data.error) {
        console.warn('[STT]', data.error);
      }
    });

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

  const startRecording = useCallback(async () => {
    if (!socket || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket) {
          e.data.arrayBuffer().then(buf => socket.emit('audioChunk', { chunk: buf }));
        }
      };

      recorder.start(500); // send chunks every 500ms
      setRecording(true);
    } catch (err) {
      console.error('[Mic] Access denied:', err);
    }
  }, [socket, recording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    socket?.emit('audioStop');
  }, [socket]);

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  const endSession = async () => {
    if (sessionId) {
      if (recording) stopRecording();
      await authFetch(`/api/sessions/${sessionId}`, { method: 'PATCH' });
      socket?.disconnect();
      navigate(`/admin/cases/${caseId}`);
    }
  };

  const completeness = prd?.content?.metadata?.completeness || 0;
  const sections = prd?.content?.sections || {};

  // Suggested questions based on empty PRD sections
  const QUESTION_SUGGESTIONS: Record<string, string[]> = {
    background: ['可以請您描述一下這個專案的背景和主要目標嗎？', '驅動這個專案的商業需求是什麼？'],
    users: ['主要的使用者是誰？有哪些不同的角色？', '使用者目前的工作流程是怎樣的？'],
    scope: ['這個專案的核心範圍是什麼？有哪些是明確不做的？'],
    asIs: ['目前的作業流程是怎麼進行的？有哪些手動步驟？'],
    toBe: ['理想的流程應該是什麼樣子？哪些步驟希望自動化？'],
    userStories: ['最重要的功能是什麼？使用者需要能做哪些事？'],
    acceptance: ['如何判斷這個功能是成功的？驗收標準是什麼？'],
    dataModel: ['系統需要處理哪些資料？有哪些重要的欄位？'],
    permissions: ['有哪些不同的權限角色？誰可以做什麼操作？'],
    nonFunctional: ['對效能、安全性、可用性有什麼要求？'],
    kpi: ['如何衡量這個專案的成功？關鍵指標是什麼？'],
    risks: ['有哪些潛在的風險或依賴？技術限制是什麼？'],
    mvpScope: ['如果要分階段實作，第一階段（MVP）應該包含什麼？'],
  };

  const suggestedQuestions = Object.entries(QUESTION_SUGGESTIONS)
    .filter(([key]) => !sections[key])
    .flatMap(([key, qs]) => qs.map(q => ({ section: key, question: q })))
    .slice(0, 5);

  return (
    <div className="interview-page">
      <div className="interview-header">
        <button className="btn-back-link" onClick={() => navigate(`/admin/cases/${caseId}`)}>← 返回案件</button>
        <h1>訪談工作台</h1>
        <div className="interview-header-right">
          <span className={`connection-status ${connected ? 'online' : 'offline'}`}>
            {connected ? '已連線' : '連線中斷'}
          </span>
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
              {leadInfo.industry && <div className="info-item"><span>產業</span>{leadInfo.industry}</div>}
              <div className="info-item"><span>需求</span>{leadInfo.needTypes?.join('、')}</div>
              {leadInfo.painPoints && <div className="info-item info-desc"><span>痛點</span>{leadInfo.painPoints}</div>}
              {leadInfo.expectedOutcome && <div className="info-item info-desc"><span>目標</span>{leadInfo.expectedOutcome}</div>}
              {leadInfo.existingTools && <div className="info-item"><span>工具</span>{leadInfo.existingTools}</div>}
              {leadInfo.description && <div className="info-item info-desc"><span>備註</span>{leadInfo.description}</div>}
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
          {suggestedQuestions.length > 0 && (
            <div className="sidebar-section">
              <h3>建議提問</h3>
              <div className="suggestion-list">
                {suggestedQuestions.map((sq, i) => (
                  <button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => {
                      setInput(sq.question);
                      inputRef.current?.focus();
                    }}
                    title={`針對「${PRD_LABELS[sq.section]}」的建議提問`}
                  >
                    <span className="suggestion-section">{PRD_LABELS[sq.section]}</span>
                    <span className="suggestion-text">{sq.question}</span>
                  </button>
                ))}
              </div>
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
                  {msg.role === 'agent' ? (
                    <Markdown content={msg.content} className="chat-msg-content" />
                  ) : (
                    <div className="chat-msg-content">{msg.content}</div>
                  )}
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
          {sttProcessing && (
            <div className="stt-processing-bar">語音辨識中...</div>
          )}
          <div className="chat-input-area">
            {sttEnabled && (
              <button
                className={`btn-mic ${recording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={!connected || agentTyping || sttProcessing}
                title={recording ? '停止錄音' : '開始語音輸入'}
              >
                {recording ? '■' : '🎤'}
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sttEnabled ? '輸入訊息或點擊麥克風語音輸入...' : '輸入訊息... (Enter 送出, Shift+Enter 換行)'}
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
            <div className="prd-panel-title-row">
              <h3>PRD 即時預覽</h3>
              <div className="prd-export-btns">
                <button className="btn-export-sm" onClick={() => {
                  authFetch(`/api/cases/${caseId}/prd/export?format=md`).then(r => r.blob()).then(b => {
                    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `PRD.md`; a.click();
                  });
                }}>MD</button>
                <button className="btn-export-sm" onClick={() => {
                  authFetch(`/api/cases/${caseId}/prd/export?format=pdf`).then(r => r.blob()).then(b => {
                    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `PRD.pdf`; a.click();
                  });
                }}>PDF</button>
              </div>
            </div>
            <span className="completeness-bar">
              <span style={{ width: `${completeness}%` }} />
            </span>
          </div>
          <div className="prd-sections">
            {Object.entries(PRD_LABELS).map(([key, label]) => (
              <div key={key} className={`prd-section ${sections[key] ? 'filled' : 'empty'}`}>
                <h4>{label} {sections[key] ? '✓' : ''}</h4>
                {sections[key] ? (
                  <Markdown content={sections[key]} className="prd-section-content" />
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
