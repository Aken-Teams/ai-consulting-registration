import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth-context';
import { I18nProvider } from './i18n';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { NotificationBell } from './components/NotificationBell';
import { KeyboardHelp } from './components/KeyboardHelp';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { InterviewPage } from './pages/InterviewPage';
import { TranscriptPage } from './pages/TranscriptPage';
import { SettingsPage } from './pages/SettingsPage';

// Error Boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>發生未預期的錯誤</h2>
            <p>{this.state.error?.message}</p>
            <button className="btn-primary" onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/admin';
            }}>
              返回首頁
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="admin-loading">載入中...</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <AuthGuard>
      <CommandPalette />
      <KeyboardHelp />
      <div className="admin-layout">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="選單">
          <span /><span /><span />
        </button>
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
        <main className="admin-main">
          <div className="admin-topbar">
            <kbd className="topbar-shortcut" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>Ctrl+K 指令</kbd>
            <NotificationBell />
          </div>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="cases/:id" element={<CaseDetailPage />} />
            <Route path="cases/:caseId/interview" element={<InterviewPage />} />
            <Route path="sessions/:sessionId/transcript" element={<TranscriptPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </AuthGuard>
  );
}

export function AdminApp() {
  return (
    <ErrorBoundary>
      <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin/*" element={<AdminLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
