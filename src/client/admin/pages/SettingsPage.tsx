import React, { useState } from 'react';
import { useAuth } from '../auth-context';

export function SettingsPage() {
  const { user, authFetch } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

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
      </div>
    </div>
  );
}
