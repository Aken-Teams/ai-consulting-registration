import React from 'react';

const steps = [
  {
    num: '01',
    title: '填寫報名表',
    desc: '花 2 分鐘告訴我們您的基本資訊與需求方向，我們會快速了解您的狀況。',
    icon: '📋',
  },
  {
    num: '02',
    title: '一對一深度訪談',
    desc: '安排線上或實體訪談，深入了解您的痛點、流程與期望，現場釐清需求與定義 MVP。',
    icon: '💬',
  },
  {
    num: '03',
    title: '現場產出，即刻可用',
    desc: '以敏捷開發方式，30-60 分鐘內交付可實際使用的流程設計、系統雛型或 AI 方案。',
    icon: '🚀',
  },
];

export function HowItWorks() {
  const scrollToForm = () => {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="section how-it-works" id="how-it-works">
      <div className="container">
        <h2 className="section-title reveal">
          三步驟，<span className="highlight">從問題到解法</span>
        </h2>
        <p className="section-subtitle reveal">
          不需要冗長的專案規劃，不需要數月的等待，一場訪談就能看到成果。
        </p>

        <div className="steps">
          {steps.map((s, i) => (
            <div className="step reveal" key={i} style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="step-icon-wrap">
                <span className="step-icon">{s.icon}</span>
                <span className="step-num">{s.num}</span>
              </div>
              {i < steps.length - 1 && <div className="step-connector" />}
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="section-cta reveal">
          <button className="btn btn-primary" onClick={scrollToForm}>
            我要預約諮詢
          </button>
        </div>
      </div>
    </section>
  );
}
