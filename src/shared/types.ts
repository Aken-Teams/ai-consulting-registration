export interface Registration {
  id: string;
  company: string;
  contactName: string;
  title: string;
  email: string;
  phone: string;
  companySize: string;
  needTypes: string[];
  description: string;
  submittedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export const NEED_TYPE_OPTIONS = [
  '流程優化',
  '作業自動化',
  '系統改造',
  '新工具導入',
  '其他',
] as const;

export const COMPANY_SIZE_OPTIONS = [
  '1-10 人',
  '11-50 人',
  '51-200 人',
  '200 人以上',
] as const;
