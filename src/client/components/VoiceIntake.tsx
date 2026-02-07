import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

interface IntakeData {
  background: string;
  currentState: string;
  painPoints: string;
  expectedOutcome: string;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

const FIELD_LABELS: Record<keyof IntakeData, string> = {
  background: '公司/團隊背景',
  currentState: '現況工作方式',
  painPoints: '具體痛點',
  expectedOutcome: '期望改善',
};

interface VoiceIntakeProps {
  onComplete?: (data: IntakeData, summary: string) => void;
}

export function VoiceIntake({ onComplete }: VoiceIntakeProps) {
  const [started, setStarted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sttProcessing, setSttProcessing] = useState(false);
  const [intakeData, setIntakeData] = useState<IntakeData>({
    background: '', currentState: '', painPoints: '', expectedOutcome: '',
  });
  const [completeness, setCompleteness] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);

  const socketRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Lazy-load socket.io-client
  const connectSocket = useCallback(async () => {
    if (socketRef.current || connecting) return;
    setConnecting(true);
    setError('');

    try {
      const { io } = await import('socket.io-client');
      const socket = io({ transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        socket.emit('intakeStart', (resp: { clientId: string; sttAvailable: boolean }) => {
          setConnected(true);
          setConnecting(false);
          setStarted(true);
          // Add greeting
          setMessages([{
            role: 'agent',
            content: '嗨！我是 AI 需求助手，可以幫你釐清問題和需求。\n\n你可以用語音或打字告訴我——你目前工作上最困擾的事情是什麼？',
            timestamp: new Date().toISOString(),
          }]);
        });
      });

      socket.on('intakeMessage', (msg: ChatMessage) => {
        setStreamingContent('');
        setMessages(prev => [...prev, msg]);
        setSending(false);
      });

      socket.on('intakeAgentTyping', (typing: boolean) => {
        setAgentTyping(typing);
        if (typing) setStreamingContent('');
      });

      socket.on('intakeAgentStream', (data: { chunk: string }) => {
        setStreamingContent(prev => prev + data.chunk);
      });

      socket.on('intakeDataUpdate', (data: {
        data: IntakeData;
        completeness: number;
        isComplete: boolean;
        summary: string;
      }) => {
        setIntakeData(data.data);
        setCompleteness(data.completeness);
        setIsComplete(data.isComplete);
        if (data.summary) setSummary(data.summary);
      });

      socket.on('intakeSttProcessing', (processing: boolean) => {
        setSttProcessing(processing);
      });

      socket.on('intakeSttResult', (data: { text: string | null; error?: string }) => {
        if (data.text) {
          setInput(data.text);
          inputRef.current?.focus();
        } else if (data.error) {
          setError(data.error);
          setTimeout(() => setError(''), 3000);
        }
      });

      socket.on('intakeError', (data: { message: string }) => {
        setError(data.message);
        setSending(false);
        setTimeout(() => setError(''), 5000);
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socketRef.current = socket;
    } catch {
      setConnecting(false);
      setError('連線失敗，請檢查網路後重試');
    }
  }, [connecting]);

  // Voice recording
  const { isRecording, isSupported, startRecording, stopRecording } = useVoiceRecording({
    onAudioChunk: useCallback((chunk: ArrayBuffer) => {
      socketRef.current?.emit('intakeAudioChunk', { chunk });
    }, []),
    onStop: useCallback(() => {
      socketRef.current?.emit('intakeAudioStop');
    }, []),
  });

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, agentTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current || !connected || sending) return;

    setMessages(prev => [...prev, {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }]);
    setInput('');
    setSending(true);
    socketRef.current.emit('intakeMessage', { message: text });
  }, [input, connected, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleComplete = () => {
    onComplete?.(intakeData, summary);
    // Scroll to registration form
    const form = document.getElementById('register');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  };

  // Not started yet — show CTA
  if (!started) {
    return (
      <section className="section voice-intake-section" id="voice-intake">
        <div className="container">
          <h2 className="section-title reveal">
            <span className="highlight">說出你的困擾</span>，AI 幫你整理需求
          </h2>
          <p className="section-subtitle reveal">
            不知道怎麼寫需求？沒關係！用說的就好，AI 助手會幫你把模糊的想法整理成清晰的需求。
          </p>
          <div className="voice-intake-start reveal">
            <button
              className="btn btn-primary btn-lg voice-intake-cta"
              onClick={connectSocket}
              disabled={connecting}
            >
              {connecting ? (
                <><span className="spinner" /> 連線中...</>
              ) : (
                <>開始對話</>
              )}
            </button>
            <p className="voice-intake-hint">
              {isSupported ? '支援語音或文字輸入' : '您的瀏覽器不支援語音，可使用文字輸入'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const filledFields = (['background', 'currentState', 'painPoints', 'expectedOutcome'] as const)
    .filter(k => intakeData[k]?.trim());

  return (
    <section className="section voice-intake-section voice-intake-active" id="voice-intake">
      <div className="container">
        <div className="voice-intake-layout">
          {/* Chat panel */}
          <div className="voice-intake-chat">
            <div className="voice-intake-chat-header">
              <h3>AI 需求助手</h3>
              <div className="voice-intake-progress">
                <div className="voice-intake-progress-bar">
                  <div
                    className="voice-intake-progress-fill"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <span className="voice-intake-progress-text">{completeness}%</span>
              </div>
            </div>

            <div className="voice-intake-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`voice-intake-msg voice-intake-msg-${msg.role}`}>
                  <div className="voice-intake-msg-bubble">
                    {msg.content}
                  </div>
                </div>
              ))}
              {agentTyping && streamingContent && (
                <div className="voice-intake-msg voice-intake-msg-agent">
                  <div className="voice-intake-msg-bubble voice-intake-msg-streaming">
                    {streamingContent}
                  </div>
                </div>
              )}
              {agentTyping && !streamingContent && (
                <div className="voice-intake-msg voice-intake-msg-agent">
                  <div className="voice-intake-msg-bubble voice-intake-typing">
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {error && <div className="voice-intake-error">{error}</div>}

            {isComplete ? (
              <div className="voice-intake-complete">
                <p>需求整理完成！</p>
                <button className="btn btn-primary" onClick={handleComplete}>
                  帶入報名表
                </button>
              </div>
            ) : (
              <div className="voice-intake-input-area">
                {sttProcessing && (
                  <div className="voice-intake-stt-status">語音辨識中...</div>
                )}
                <div className="voice-intake-input-row">
                  {isSupported && (
                    <button
                      className={`voice-intake-mic-btn ${isRecording ? 'recording' : ''}`}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={!connected || sttProcessing}
                      title={isRecording ? '停止錄音' : '開始錄音'}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                      {isRecording && <span className="mic-pulse" />}
                    </button>
                  )}
                  <textarea
                    ref={inputRef}
                    className="voice-intake-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入你的想法，或按麥克風說話..."
                    rows={1}
                    disabled={!connected || sending}
                  />
                  <button
                    className="voice-intake-send-btn"
                    onClick={sendMessage}
                    disabled={!input.trim() || !connected || sending}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Summary panel */}
          <div className={`voice-intake-summary ${showSummaryPanel ? 'show-mobile' : ''}`}>
            <div className="voice-intake-summary-header">
              <h3>需求摘要</h3>
              <button
                className="voice-intake-summary-toggle"
                onClick={() => setShowSummaryPanel(!showSummaryPanel)}
              >
                {showSummaryPanel ? '收合' : '展開'}
              </button>
            </div>
            <div className="voice-intake-summary-content">
              {(['background', 'currentState', 'painPoints', 'expectedOutcome'] as const).map(key => (
                <div key={key} className={`voice-intake-field ${intakeData[key]?.trim() ? 'filled' : ''}`}>
                  <div className="voice-intake-field-header">
                    <span className={`voice-intake-field-dot ${intakeData[key]?.trim() ? 'active' : ''}`} />
                    <span className="voice-intake-field-label">{FIELD_LABELS[key]}</span>
                  </div>
                  {intakeData[key]?.trim() ? (
                    <p className="voice-intake-field-content">{intakeData[key]}</p>
                  ) : (
                    <p className="voice-intake-field-empty">等待收集...</p>
                  )}
                </div>
              ))}
              {summary && (
                <div className="voice-intake-final-summary">
                  <h4>整體摘要</h4>
                  <p>{summary}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
