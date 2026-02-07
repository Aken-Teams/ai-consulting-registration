import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const commands: Command[] = [
    { id: 'dashboard', label: '前往儀表板', shortcut: 'G D', action: () => navigate('/admin') },
    { id: 'settings', label: '前往帳號設定', shortcut: 'G S', action: () => navigate('/admin/settings') },
    { id: 'search', label: '搜尋案件...', action: () => { navigate('/admin'); setTimeout(() => { const el = document.querySelector('.search-input') as HTMLInputElement; el?.focus(); }, 100); } },
    { id: 'export-csv', label: '匯出案件 CSV', action: () => { document.querySelector<HTMLButtonElement>('.btn-export-csv')?.click(); } },
    { id: 'refresh', label: '重新整理資料', shortcut: 'R', action: () => { document.querySelector<HTMLButtonElement>('.btn-refresh')?.click(); } },
  ];

  const filtered = query.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const execute = useCallback((cmd: Command) => {
    setOpen(false);
    setQuery('');
    cmd.action();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      execute(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={() => setOpen(false)}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-wrapper">
          <svg className="cmd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            className="cmd-input"
            type="text"
            placeholder="輸入指令或搜尋..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-list">
          {filtered.length === 0 ? (
            <div className="cmd-empty">沒有符合的指令</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`cmd-item ${i === selectedIndex ? 'cmd-item-active' : ''}`}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="cmd-item-label">{cmd.label}</span>
                {cmd.shortcut && <kbd className="cmd-item-shortcut">{cmd.shortcut}</kbd>}
              </button>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> 導覽</span>
          <span><kbd>Enter</kbd> 執行</span>
          <span><kbd>Esc</kbd> 關閉</span>
        </div>
      </div>
    </div>
  );
}
