import React, { useEffect, useRef, useState } from 'react';

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            setValue(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

export function Hero() {
  const scrollToForm = () => {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  const stat1 = useCountUp(30);
  const stat2 = useCountUp(100);
  const stat3 = useCountUp(0, 800);

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
            <span className="stat-number" ref={stat1.ref}>{stat1.value}<small>min</small></span>
            <span className="stat-label">最快產出時間</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-number" ref={stat2.ref}>{stat2.value}<small>%</small></span>
            <span className="stat-label">可立即使用</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-number" ref={stat3.ref}>{stat3.value}<small>元</small></span>
            <span className="stat-label">諮詢費用</span>
          </div>
        </div>
      </div>
    </section>
  );
}
