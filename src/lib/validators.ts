import { z } from 'zod/v4';

export const registerSchema = z.object({
  company: z.string().min(1, '請填寫公司名稱').max(200),
  contactName: z.string().min(1, '請填寫聯絡人姓名').max(100),
  title: z.string().max(100).optional().default(''),
  email: z.email('請填寫有效的 Email'),
  phone: z.string().regex(/^[\d\-+() ]{7,20}$/, '請填寫有效的電話號碼'),
  companySize: z.enum(['1-10 人', '11-50 人', '51-200 人', '201-1000 人', '1000+ 人']),
  needTypes: z.array(z.string()).min(1, '請至少選擇一項需求類型'),
  description: z.string().max(2000).optional().default(''),
  industry: z.string().max(100).optional().default(''),
  painPoints: z.string().max(2000).optional().default(''),
  expectedOutcome: z.string().max(2000).optional().default(''),
  existingTools: z.string().max(500).optional().default(''),
  preferredTimeslots: z.array(z.string()).optional(),
  source: z.string().max(200).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
});

export const loginSchema = z.object({
  email: z.email('請輸入有效的 Email'),
  password: z.string().min(1, '請輸入密碼'),
});

const VALID_STATUSES = ['new', 'scheduled', 'interviewing', 'pending_review', 'prd_draft', 'prd_locked', 'mvp', 'closed'] as const;
const VALID_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;

export const updateCaseSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  consultantId: z.number().int().positive().nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
}).refine(data => Object.keys(data).length > 0, { message: '無更新欄位' });

export const prdSectionSchema = z.object({
  sectionKey: z.string().min(1),
  content: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
