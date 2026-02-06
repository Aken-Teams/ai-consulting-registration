import React, { useRef, useState, useEffect } from 'react';

const cases = [
  {
    icon: '📊',
    title: '內部流程優化',
    desc: '簽核流程、報表彙整、進度追蹤⋯⋯把繁瑣的日常工作變得更快更順。',
    tags: ['簽核自動化', '報表整合', '流程簡化'],
  },
  {
    icon: '⚙️',
    title: '作業自動化',
    desc: '資料搬運、重複性輸入、定期通知⋯⋯讓 AI 代勞，人力專注在高價值任務。',
    tags: ['RPA', '自動通知', '資料同步'],
  },
  {
    icon: '🏗️',
    title: '系統改造',
    desc: '老舊系統翻新、跨系統串接、新模組開發⋯⋯用最小成本達成最大效益。',
    tags: ['API 串接', '系統升級', '模組開發'],
  },
  {
    icon: '🆕',
    title: '新工具導入',
    desc: 'AI 客服、智慧助理、知識庫系統⋯⋯把最新的 AI 技術變成您的競爭優勢。',
    tags: ['AI 助理', '知識管理', '智慧客服'],
  },
];

export function UseCases() {
  const scrollToForm = () => {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const onScroll = () => {
      const scrollLeft = el.scrollLeft;
      const itemWidth = el.children[0]?.clientWidth || 1;
      const gap = 16;
      setActiveIndex(Math.round(scrollLeft / (itemWidth + gap)));
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToDot = (i: number) => {
    const el = carouselRef.current;
    if (!el || !el.children[i]) return;
    const child = el.children[i] as HTMLElement;
    el.scrollTo({ left: child.offsetLeft - 16, behavior: 'smooth' });
  };

  return (
    <section className="section use-cases" id="use-cases">
      <div className="container">
        <h2 className="section-title reveal">
          <span className="highlight">哪些情境</span>適合找我們？
        </h2>
        <p className="section-subtitle reveal">
          不管您的需求是大是小，只要能說清楚，我們就能做出來。
        </p>

        {/* Desktop grid */}
        <div className="cases-grid">
          {cases.map((c, i) => (
            <div className="case-card reveal" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="case-icon">{c.icon}</span>
              <h3 className="case-title">{c.title}</h3>
              <p className="case-desc">{c.desc}</p>
              <div className="case-tags">
                {c.tags.map((t) => (
                  <span className="tag" key={t}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile carousel */}
        <div className="cases-carousel" ref={carouselRef}>
          {cases.map((c, i) => (
            <div className="case-card" key={i}>
              <span className="case-icon">{c.icon}</span>
              <h3 className="case-title">{c.title}</h3>
              <p className="case-desc">{c.desc}</p>
              <div className="case-tags">
                {c.tags.map((t) => (
                  <span className="tag" key={t}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="carousel-dots">
          {cases.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot${i === activeIndex ? ' active' : ''}`}
              onClick={() => scrollToDot(i)}
              aria-label={`第 ${i + 1} 張`}
            />
          ))}
        </div>

        <div className="section-cta reveal">
          <button className="btn btn-primary btn-lg" onClick={scrollToForm}>
            我有需求，立即報名
          </button>
        </div>
      </div>
    </section>
  );
}
