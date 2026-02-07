import React, { createContext, useContext, useState, useCallback } from 'react';

export type Locale = 'zh-TW' | 'en-US';

const translations: Record<Locale, Record<string, string>> = {
  'zh-TW': {
    'nav.dashboard': '儀表板',
    'nav.settings': '設定',
    'dashboard.title': '儀表板',
    'dashboard.totalLeads': '總報名數',
    'dashboard.activeCases': '進行中案件',
    'dashboard.totalCases': '案件總數',
    'dashboard.topNeed': '最常見需求',
    'dashboard.conversionRate': '轉換率',
    'dashboard.pageViews': '頁面瀏覽',
    'dashboard.recentLead': '最近報名',
    'dashboard.queue': '待分配案件',
    'dashboard.caseList': '案件列表',
    'dashboard.activity': '近期動態',
    'dashboard.trends': '報名趨勢（近 14 天）',
    'dashboard.funnel': '案件轉換漏斗',
    'dashboard.duplicateWarning': '重複報名提醒',
    'table.id': '#',
    'table.company': '公司',
    'table.contact': '聯絡人',
    'table.status': '狀態',
    'table.priority': '優先度',
    'table.needType': '需求類型',
    'table.score': '評分',
    'table.createdAt': '建立時間',
    'action.refresh': '重新整理',
    'action.exportCSV': '匯出 CSV',
    'action.exportJSON': '匯出 JSON',
    'action.exportReport': '匯出報告',
    'action.bulkEmail': '群發郵件',
    'action.autoRefresh': '自動更新',
    'action.autoRefreshOn': '自動更新 ON',
    'action.search': '搜尋公司 / 聯絡人 / Email...',
    'action.save': '儲存',
    'action.cancel': '取消',
    'action.edit': '編輯',
    'action.delete': '刪除',
    'action.apply': '套用',
    'filter.all': '全部',
    'filter.today': '今日',
    'filter.thisWeek': '本週',
    'filter.thisMonth': '本月',
    'filter.last30': '近30天',
    'filter.clear': '清除',
    'status.new': '新案件',
    'status.scheduled': '已排程',
    'status.interviewing': '訪談中',
    'status.pending_review': '待審閱',
    'status.prd_draft': 'PRD 草稿',
    'status.prd_locked': 'PRD 鎖版',
    'status.mvp': 'MVP 中',
    'status.closed': '已結案',
    'priority.urgent': '緊急',
    'priority.high': '高',
    'priority.normal': '一般',
    'priority.low': '低',
    'loading': '載入中...',
    'noData': '目前沒有案件',
    'noResults': '沒有符合的搜尋結果',
    'settings.title': '系統設定',
    'settings.theme': '主題',
    'settings.language': '語言',
    'settings.darkMode': '深色模式',
    'settings.lightMode': '淺色模式',
  },
  'en-US': {
    'nav.dashboard': 'Dashboard',
    'nav.settings': 'Settings',
    'dashboard.title': 'Dashboard',
    'dashboard.totalLeads': 'Total Leads',
    'dashboard.activeCases': 'Active Cases',
    'dashboard.totalCases': 'Total Cases',
    'dashboard.topNeed': 'Top Need',
    'dashboard.conversionRate': 'Conversion Rate',
    'dashboard.pageViews': 'Page Views',
    'dashboard.recentLead': 'Recent Lead',
    'dashboard.queue': 'Unassigned Cases',
    'dashboard.caseList': 'Case List',
    'dashboard.activity': 'Recent Activity',
    'dashboard.trends': 'Registration Trends (14 days)',
    'dashboard.funnel': 'Case Conversion Funnel',
    'dashboard.duplicateWarning': 'Duplicate Lead Alert',
    'table.id': '#',
    'table.company': 'Company',
    'table.contact': 'Contact',
    'table.status': 'Status',
    'table.priority': 'Priority',
    'table.needType': 'Need Type',
    'table.score': 'Score',
    'table.createdAt': 'Created',
    'action.refresh': 'Refresh',
    'action.exportCSV': 'Export CSV',
    'action.exportJSON': 'Export JSON',
    'action.exportReport': 'Export Report',
    'action.bulkEmail': 'Bulk Email',
    'action.autoRefresh': 'Auto Refresh',
    'action.autoRefreshOn': 'Auto Refresh ON',
    'action.search': 'Search company / contact / email...',
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.apply': 'Apply',
    'filter.all': 'All',
    'filter.today': 'Today',
    'filter.thisWeek': 'This Week',
    'filter.thisMonth': 'This Month',
    'filter.last30': 'Last 30 Days',
    'filter.clear': 'Clear',
    'status.new': 'New',
    'status.scheduled': 'Scheduled',
    'status.interviewing': 'Interviewing',
    'status.pending_review': 'Pending Review',
    'status.prd_draft': 'PRD Draft',
    'status.prd_locked': 'PRD Locked',
    'status.mvp': 'MVP',
    'status.closed': 'Closed',
    'priority.urgent': 'Urgent',
    'priority.high': 'High',
    'priority.normal': 'Normal',
    'priority.low': 'Low',
    'loading': 'Loading...',
    'noData': 'No cases yet',
    'noResults': 'No matching results',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.language': 'Language',
    'settings.darkMode': 'Dark Mode',
    'settings.lightMode': 'Light Mode',
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'zh-TW',
  setLocale: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => (localStorage.getItem('locale') as Locale) || 'zh-TW'
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[locale]?.[key] || translations['zh-TW']?.[key] || key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
