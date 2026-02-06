import React, { useState } from 'react';
import type { ApiResponse } from '../../shared/types';

const NEED_OPTIONS = ['流程優化', '作業自動化', '系統改造', '新工具導入', '其他'];
const SIZE_OPTIONS = ['1-10 人', '11-50 人', '51-200 人', '200 人以上'];
const INDUSTRY_OPTIONS = ['科技業', '製造業', '金融業', '零售/電商', '醫療', '教育', '服務業', '其他'];
const TIMESLOT_OPTIONS = ['平日上午', '平日下午', '平日晚間', '週末'];

interface FormData {
  company: string;
  contactName: string;
  title: string;
  email: string;
  phone: string;
  companySize: string;
  needTypes: string[];
  description: string;
  industry: string;
  painPoints: string;
  expectedOutcome: string;
  existingTools: string;
  preferredTimeslots: string[];
}

const emptyForm: FormData = {
  company: '',
  contactName: '',
  title: '',
  email: '',
  phone: '',
  companySize: '',
  needTypes: [],
  description: '',
  industry: '',
  painPoints: '',
  expectedOutcome: '',
  existingTools: '',
  preferredTimeslots: [],
};

export function RegistrationForm() {
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  const set = (field: keyof FormData, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleArray = (field: 'needTypes' | 'preferredTimeslots', item: string) => {
    setForm((prev) => {
      const arr = prev[field];
      const has = arr.includes(item);
      return { ...prev, [field]: has ? arr.filter((n) => n !== item) : [...arr, item] };
    });
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.company.trim()) e.company = '請填寫公司名稱';
    if (!form.contactName.trim()) e.contactName = '請填寫聯絡人姓名';
    if (!form.email.trim()) {
      e.email = '請填寫 Email';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = '請輸入有效的 Email 格式';
    }
    if (!form.phone.trim()) {
      e.phone = '請填寫電話號碼';
    } else if (!/^[\d\-+() ]{7,20}$/.test(form.phone)) {
      e.phone = '請輸入有效的電話號碼';
    }
    if (!form.companySize) e.companySize = '請選擇公司規模';
    if (form.needTypes.length === 0) e.needTypes = '請至少選擇一項需求類型';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data: ApiResponse = await res.json();

      if (!res.ok || !data.success) {
        setServerError(data.message || '提交失敗，請稍後再試。');
        return;
      }

      setSubmitted(true);
      setForm({ ...emptyForm });
    } catch {
      setServerError('網路錯誤，請檢查連線後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="section register-section" id="register">
        <div className="container">
          <div className="success-card">
            <div className="success-icon">🎉</div>
            <h2>報名成功！</h2>
            <p>感謝您的報名，我們將盡快與您聯繫，安排一對一深度訪談。</p>
            <p className="success-note">請留意您的 Email 信箱，我們會在 1-2 個工作天內回覆。</p>
            <button className="btn btn-outline" onClick={() => setSubmitted(false)}>
              再次報名
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section register-section" id="register">
      <div className="container">
        <h2 className="section-title reveal">
          <span className="highlight">立即報名</span>，開始您的 AI 輔能之旅
        </h2>
        <p className="section-subtitle reveal">
          填寫以下資訊，我們將盡快安排一對一諮詢。完全免費，沒有任何附加條件。
        </p>

        <form className="reg-form reveal" onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="company">公司名稱 <span className="required">*</span></label>
              <input
                id="company"
                type="text"
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="例：台灣科技股份有限公司"
                className={errors.company ? 'error' : ''}
                disabled={submitting}
              />
              {errors.company && <span className="field-error">{errors.company}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="contactName">聯絡人姓名 <span className="required">*</span></label>
              <input
                id="contactName"
                type="text"
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                placeholder="例：王大明"
                className={errors.contactName ? 'error' : ''}
                disabled={submitting}
              />
              {errors.contactName && <span className="field-error">{errors.contactName}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="title">職稱</label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="例：資訊部經理"
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="industry">產業別</label>
              <select
                id="industry"
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                disabled={submitting}
              >
                <option value="">請選擇</option>
                {INDUSTRY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email <span className="required">*</span></label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="example@company.com"
                className={errors.email ? 'error' : ''}
                disabled={submitting}
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="phone">電話 <span className="required">*</span></label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="02-1234-5678 或 0912-345-678"
                className={errors.phone ? 'error' : ''}
                disabled={submitting}
              />
              {errors.phone && <span className="field-error">{errors.phone}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="companySize">公司規模 <span className="required">*</span></label>
              <select
                id="companySize"
                value={form.companySize}
                onChange={(e) => set('companySize', e.target.value)}
                className={errors.companySize ? 'error' : ''}
                disabled={submitting}
              >
                <option value="">請選擇</option>
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.companySize && <span className="field-error">{errors.companySize}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="existingTools">現有工具/系統</label>
              <input
                id="existingTools"
                type="text"
                value={form.existingTools}
                onChange={(e) => set('existingTools', e.target.value)}
                placeholder="例：Excel、ERP、自建系統..."
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label>需求類型 <span className="required">*</span>（可複選）</label>
            <div className="checkbox-group">
              {NEED_OPTIONS.map((n) => (
                <label key={n} className={`checkbox-label${form.needTypes.includes(n) ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.needTypes.includes(n)}
                    onChange={() => toggleArray('needTypes', n)}
                    disabled={submitting}
                  />
                  <span className="checkbox-custom" />
                  {n}
                </label>
              ))}
            </div>
            {errors.needTypes && <span className="field-error">{errors.needTypes}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="painPoints">想解決的痛點</label>
            <textarea
              id="painPoints"
              value={form.painPoints}
              onChange={(e) => set('painPoints', e.target.value)}
              placeholder="例：每月花 3 天手動整理報表、客戶回覆速度太慢..."
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="expectedOutcome">期望成果</label>
              <textarea
                id="expectedOutcome"
                value={form.expectedOutcome}
                onChange={(e) => set('expectedOutcome', e.target.value)}
                placeholder="例：減少 50% 人工作業、提升回覆效率..."
                rows={2}
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="description">其他補充說明</label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="任何您想補充的資訊..."
                rows={2}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label>方便的訪談時段（可複選）</label>
            <div className="checkbox-group">
              {TIMESLOT_OPTIONS.map((t) => (
                <label key={t} className={`checkbox-label${form.preferredTimeslots.includes(t) ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.preferredTimeslots.includes(t)}
                    onChange={() => toggleArray('preferredTimeslots', t)}
                    disabled={submitting}
                  />
                  <span className="checkbox-custom" />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {serverError && (
            <div className="server-error">{serverError}</div>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" />
                提交中⋯⋯
              </>
            ) : (
              <>送出報名</>
            )}
          </button>

          <p className="form-privacy">
            您的資料將被妥善保管，僅用於安排諮詢使用。
          </p>
        </form>
      </div>
    </section>
  );
}
