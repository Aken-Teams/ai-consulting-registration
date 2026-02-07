import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth-context';
import { useI18n, Locale } from '../i18n';

interface SystemInfo {
  uptime: number;
  db: string;
  nodeVersion?: string;
  memoryUsage?: number;
}

export function SettingsPage() {
  const { user, authFetch } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => {
      setSystemInfo(d);
    }).catch(() => {});
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密碼至少 6 個字元' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '新密碼與確認密碼不一致' });
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '密碼已成功更新' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.message || '更新失敗' });
      }
    } catch {
      setMessage({ type: 'error', text: '伺服器錯誤' });
    } finally {
      setSaving(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = { admin: '管理員', consultant: '顧問' };

  return (
    <div className="settings-page">
      <h1>帳號設定</h1>

      <div className="settings-grid">
        <div className="settings-card">
          <h2>個人資訊</h2>
          <div className="settings-fields">
            <div className="settings-field">
              <span className="settings-label">姓名</span>
              <span>{user?.name || '-'}</span>
            </div>
            <div className="settings-field">
              <span className="settings-label">Email</span>
              <span>{user?.email}</span>
            </div>
            <div className="settings-field">
              <span className="settings-label">角色</span>
              <span className="role-badge">{ROLE_LABELS[user?.role || ''] || user?.role}</span>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h2>變更密碼</h2>
          <form onSubmit={handleChangePassword} className="password-form">
            <div className="form-group">
              <label>目前密碼</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少 6 個字元"
              />
            </div>
            <div className="form-group">
              <label>確認新密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {message && (
              <div className={`settings-message ${message.type}`}>
                {message.text}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '更新中...' : '更新密碼'}
            </button>
          </form>
        </div>

        {systemInfo && (
          <div className="settings-card">
            <h2>系統資訊</h2>
            <div className="settings-fields">
              <div className="settings-field">
                <span className="settings-label">伺服器狀態</span>
                <span className={`status-indicator ${systemInfo.db === 'connected' ? 'status-ok' : 'status-err'}`}>
                  {systemInfo.db === 'connected' ? '正常運作' : '連線異常'}
                </span>
              </div>
              <div className="settings-field">
                <span className="settings-label">資料庫</span>
                <span>{systemInfo.db === 'connected' ? 'PostgreSQL 已連線' : '未連線'}</span>
              </div>
              <div className="settings-field">
                <span className="settings-label">運行時間</span>
                <span>{formatUptime(systemInfo.uptime)}</span>
              </div>
              <div className="settings-field">
                <span className="settings-label">技術棧</span>
                <span>React 18 + Express + PostgreSQL</span>
              </div>
              <div className="settings-field">
                <span className="settings-label">版本</span>
                <span>v1.0.0</span>
              </div>
            </div>
          </div>
        )}

        <div className="settings-card">
          <h2>{t('settings.language')}</h2>
          <div className="settings-fields">
            <div className="settings-field">
              <span className="settings-label">語言 / Language</span>
              <div className="locale-toggle">
                {(['zh-TW', 'en-US'] as Locale[]).map(loc => (
                  <button
                    key={loc}
                    className={`locale-btn ${locale === loc ? 'active' : ''}`}
                    onClick={() => setLocale(loc)}
                  >
                    {loc === 'zh-TW' ? '繁體中文' : 'English'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h2>快捷鍵</h2>
          <div className="settings-fields">
            <div className="settings-field">
              <span className="settings-label"><kbd>Ctrl + K</kbd></span>
              <span>指令面板</span>
            </div>
            <div className="settings-field">
              <span className="settings-label"><kbd>?</kbd></span>
              <span>快捷鍵說明</span>
            </div>
            <div className="settings-field">
              <span className="settings-label"><kbd>Esc</kbd></span>
              <span>關閉對話框</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d} 天`);
  if (h > 0) parts.push(`${h} 小時`);
  parts.push(`${m} 分鐘`);
  return parts.join(' ');
}
