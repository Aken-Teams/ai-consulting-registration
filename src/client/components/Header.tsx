import React, { useState, useEffect } from 'react';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="container header-inner">
        <a className="logo" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="logo-icon">AI</span>
          <span className="logo-text">輔能諮詢</span>
        </a>

        <nav className={`nav${menuOpen ? ' open' : ''}`}>
          <button className="nav-link" onClick={() => scrollTo('pain-points')}>企業痛點</button>
          <button className="nav-link" onClick={() => scrollTo('how-it-works')}>諮詢流程</button>
          <button className="nav-link" onClick={() => scrollTo('value-props')}>為什麼選我們</button>
          <button className="nav-link" onClick={() => scrollTo('use-cases')}>適用情境</button>
          <button className="nav-link cta-nav" onClick={() => scrollTo('register')}>立即報名</button>
        </nav>

        <button
          className={`hamburger${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="選單"
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}
