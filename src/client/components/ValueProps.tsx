import React from 'react';

const props = [
  {
    label: '不是簡報',
    emphasis: '是實作',
    desc: '我們不做 PowerPoint 導向的顧問服務，而是在訪談現場就動手做出可用的成果。',
    icon: '⚡',
  },
  {
    label: '不是一次性展示',
    emphasis: '是可延伸的工具',
    desc: '產出的方案可以讓您在後續自行調整與延伸應用，真正落實在日常營運中。',
    icon: '🔧',
  },
  {
    label: '不是口號',
    emphasis: '是即時可用的成果',
    desc: '30-60 分鐘內，從需求定義到可部署的解決方案，說到做到。',
    icon: '✅',
  },
  {
    label: '不是想像',
    emphasis: '是加速轉型的引擎',
    desc: '透過 AI 輔能，加速企業決策、流程與轉型的速度，立即感受改變。',
    icon: '🏎️',
  },
];

export function ValueProps() {
  return (
    <section className="section value-props" id="value-props">
      <div className="container">
        <h2 className="section-title reveal">
          為什麼選擇<span className="highlight">我們？</span>
        </h2>

        <div className="value-grid">
          {props.map((p, i) => (
            <div className="value-card reveal" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="value-icon">{p.icon}</span>
              <h3 className="value-title">
                <span className="value-label">{p.label}，</span>
                <span className="value-emphasis">{p.emphasis}</span>
              </h3>
              <p className="value-desc">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
