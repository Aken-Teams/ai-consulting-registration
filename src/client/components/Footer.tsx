import React from 'react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="logo-icon">AI</span>
          <span className="logo-text">輔能諮詢</span>
        </div>
        <p className="footer-copy">&copy; {year} AI 輔能諮詢. All rights reserved.</p>
      </div>
    </footer>
  );
}
