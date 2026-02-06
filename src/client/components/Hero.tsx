import React from 'react';

export function Hero() {
  const scrollToForm = () => {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hero" id="hero">
      <div className="hero-bg">
        <div className="hero-particle p1" />
        <div className="hero-particle p2" />
        <div className="hero-particle p3" />
        <div className="hero-particle p4" />
      </div>

      <div className="container hero-content">
        <div className="hero-badge">AI 輔能 × 敏捷實戰</div>
        <h1 className="hero-title">
          不只是諮詢<br />
          <span className="highlight">馬上談、馬上做、馬上用</span>
        </h1>
        <p className="hero-subtitle">
          透過一對一深度訪談，30-60 分鐘內將您的需求轉化為<br className="hide-mobile" />
          可立即部署上線的流程設計、系統雛型或 AI 應用方案
        </p>

        <div className="hero-actions">
          <button className="btn btn-primary btn-lg pulse-btn" onClick={scrollToForm}>
            預約 AI 輔能諮詢
            <span className="btn-arrow">&rarr;</span>
          </button>
          <p className="hero-note">免費諮詢 &middot; 現場產出 &middot; 即刻可用</p>
        </div>

        <div className="hero-stats">
          <div className="stat">
            <span className="stat-number">30<small>min</small></span>
            <span className="stat-label">最快產出時間</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-number">100<small>%</small></span>
            <span className="stat-label">可立即使用</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-number">0<small>元</small></span>
            <span className="stat-label">諮詢費用</span>
          </div>
        </div>
      </div>
    </section>
  );
}
