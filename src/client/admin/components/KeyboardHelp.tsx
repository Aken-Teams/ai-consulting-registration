import React, { useEffect, useState } from 'react';

const SHORTCUT_GROUPS = [
  {
    title: '全域',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: '開啟指令面板' },
      { keys: ['?'], description: '顯示快捷鍵說明' },
      { keys: ['Esc'], description: '關閉對話框 / 面板' },
    ],
  },
  {
    title: '指令面板',
    shortcuts: [
      { keys: ['\u2191', '\u2193'], description: '上下選擇指令' },
      { keys: ['Enter'], description: '執行選中的指令' },
      { keys: ['Esc'], description: '關閉指令面板' },
    ],
  },
  {
    title: '儀表板',
    shortcuts: [
      { keys: ['Ctrl', 'K', '\u2192', '搜尋'], description: '快速搜尋案件' },
    ],
  },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="kbd-help-overlay" onClick={() => setOpen(false)}>
      <div className="kbd-help-modal" onClick={e => e.stopPropagation()}>
        <div className="kbd-help-header">
          <h2>快捷鍵</h2>
          <button className="kbd-help-close" onClick={() => setOpen(false)}>x</button>
        </div>
        <div className="kbd-help-body">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title} className="kbd-help-group">
              <h3>{group.title}</h3>
              <div className="kbd-help-list">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="kbd-help-item">
                    <div className="kbd-help-keys">
                      {s.keys.map((k, j) => (
                        <span key={j}>
                          {j > 0 && <span className="kbd-help-plus">+</span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </div>
                    <span className="kbd-help-desc">{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
