import {
  pgTable, pgEnum, integer, varchar, text, timestamp,
  boolean, jsonb, serial, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Reusable timestamp columns ───
const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
    .defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true })
    .defaultNow().notNull().$onUpdateFn(() => new Date()),
};

// ─── Enums ───
export const caseStatusEnum = pgEnum('case_status', [
  'new', 'scheduled', 'interviewing', 'pending_review',
  'prd_draft', 'prd_locked', 'mvp', 'closed',
]);

export const userRoleEnum = pgEnum('user_role', ['admin', 'consultant']);

export const speakerRoleEnum = pgEnum('speaker_role', ['consultant', 'client', 'agent']);

export const casePriorityEnum = pgEnum('case_priority', ['urgent', 'high', 'normal', 'low']);

// ─── Users (admin / consultant) ───
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  role: userRoleEnum('role').default('consultant').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('users_email_unique').on(table.email),
]);

// ─── Leads (registration data) ───
export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  company: varchar('company', { length: 200 }).notNull(),
  contactName: varchar('contact_name', { length: 200 }).notNull(),
  title: varchar('title', { length: 200 }),
  email: varchar('email', { length: 320 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  companySize: varchar('company_size', { length: 50 }).notNull(),
  needTypes: jsonb('need_types').$type<string[]>().notNull(),
  description: text('description'),
  industry: varchar('industry', { length: 100 }),
  painPoints: text('pain_points'),
  expectedOutcome: text('expected_outcome'),
  existingTools: text('existing_tools'),
  preferredTimeslots: jsonb('preferred_timeslots').$type<string[]>(),
  source: varchar('source', { length: 200 }),
  utmSource: varchar('utm_source', { length: 200 }),
  utmMedium: varchar('utm_medium', { length: 200 }),
  utmCampaign: varchar('utm_campaign', { length: 200 }),
  referrer: varchar('referrer', { length: 500 }),
  voiceIntakeData: jsonb('voice_intake_data').$type<{
    background?: string;
    currentState?: string;
    painPoints?: string;
    expectedOutcome?: string;
  }>(),
  ...timestamps,
});

// ─── Cases ───
export const cases = pgTable('cases', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  consultantId: integer('consultant_id').references(() => users.id),
  status: caseStatusEnum('status').default('new').notNull(),
  priority: casePriorityEnum('priority').default('normal').notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { mode: 'date', withTimezone: true }),
  completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  isPinned: boolean('is_pinned').default(false).notNull(),
  ...timestamps,
}, (table) => [
  index('cases_lead_idx').on(table.leadId),
  index('cases_consultant_idx').on(table.consultantId),
  index('cases_status_idx').on(table.status),
]);

// ─── Sessions (interview sessions) ───
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { mode: 'date', withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  notes: text('notes'),
  ...timestamps,
}, (table) => [
  index('sessions_case_idx').on(table.caseId),
]);

// ─── Transcripts ───
export const transcripts = pgTable('transcripts', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  speaker: speakerRoleEnum('speaker').notNull(),
  content: text('content').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  ...timestamps,
}, (table) => [
  index('transcripts_session_idx').on(table.sessionId),
  index('transcripts_sequence_idx').on(table.sessionId, table.sequenceNumber),
]);

// ─── PRD Versions ───
export type PrdSection = {
  background?: string;
  users?: string;
  scope?: string;
  asIs?: string;
  toBe?: string;
  userStories?: string;
  acceptance?: string;
  dataModel?: string;
  permissions?: string;
  nonFunctional?: string;
  kpi?: string;
  risks?: string;
  mvpScope?: string;
};

export type PrdContent = {
  sections: PrdSection;
  metadata?: {
    completeness?: number;
    lastUpdatedSection?: string;
    totalInterviewMinutes?: number;
  };
};

export const prdVersions = pgTable('prd_versions', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  versionNumber: integer('version_number').notNull(),
  content: jsonb('content').$type<PrdContent>().notNull(),
  markdown: text('markdown').notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  lockedAt: timestamp('locked_at', { mode: 'date', withTimezone: true }),
  lockedBy: integer('locked_by').references(() => users.id),
  ...timestamps,
}, (table) => [
  index('prd_versions_case_idx').on(table.caseId),
  uniqueIndex('prd_versions_case_version_unique').on(table.caseId, table.versionNumber),
]);

// ─── Agent Events ───
export type AgentEventPayload = {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  [key: string]: unknown;
};

export const agentEvents = pgTable('agent_events', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').$type<AgentEventPayload>().notNull(),
  ...timestamps,
}, (table) => [
  index('agent_events_case_idx').on(table.caseId),
  index('agent_events_session_idx').on(table.sessionId),
]);

// ─── Notifications ───
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'new_lead', 'status_change', 'comment', 'prd_locked'
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  link: varchar('link', { length: 500 }),
  isRead: boolean('is_read').default(false).notNull(),
  ...timestamps,
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_read_idx').on(table.userId, table.isRead),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── Case Comments ───
export const caseComments = pgTable('case_comments', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  ...timestamps,
}, (table) => [
  index('case_comments_case_idx').on(table.caseId),
]);

// ─── Page Views (Landing Page Analytics) ───
export const pageViews = pgTable('page_views', {
  id: serial('id').primaryKey(),
  path: varchar('path', { length: 500 }).notNull(),
  referrer: varchar('referrer', { length: 1000 }),
  userAgent: varchar('user_agent', { length: 500 }),
  ip: varchar('ip', { length: 45 }),
  createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
    .defaultNow().notNull(),
}, (table) => [
  index('page_views_path_idx').on(table.path),
  index('page_views_created_idx').on(table.createdAt),
]);

// ─── Case Status History (Audit Log) ───
export const caseStatusHistory = pgTable('case_status_history', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id),
  fromStatus: caseStatusEnum('from_status'),
  toStatus: caseStatusEnum('to_status').notNull(),
  note: text('note'),
  ...timestamps,
}, (table) => [
  index('case_status_history_case_idx').on(table.caseId),
]);

// ─── Artifacts ───
export const artifacts = pgTable('artifacts', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  prdVersionId: integer('prd_version_id').references(() => prdVersions.id),
  filename: varchar('filename', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes'),
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  ...timestamps,
}, (table) => [
  index('artifacts_case_idx').on(table.caseId),
]);

// ─── Relations ───
export const usersRelations = relations(users, ({ many }) => ({
  assignedCases: many(cases),
}));

export const leadsRelations = relations(leads, ({ many }) => ({
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  lead: one(leads, { fields: [cases.leadId], references: [leads.id] }),
  consultant: one(users, { fields: [cases.consultantId], references: [users.id] }),
  sessions: many(sessions),
  prdVersions: many(prdVersions),
  agentEvents: many(agentEvents),
  artifacts: many(artifacts),
  comments: many(caseComments),
  statusHistory: many(caseStatusHistory),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  case_: one(cases, { fields: [sessions.caseId], references: [cases.id] }),
  transcripts: many(transcripts),
  agentEvents: many(agentEvents),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  session: one(sessions, { fields: [transcripts.sessionId], references: [sessions.id] }),
}));

export const prdVersionsRelations = relations(prdVersions, ({ one, many }) => ({
  case_: one(cases, { fields: [prdVersions.caseId], references: [cases.id] }),
  lockedByUser: one(users, { fields: [prdVersions.lockedBy], references: [users.id] }),
  artifacts: many(artifacts),
}));

export const agentEventsRelations = relations(agentEvents, ({ one }) => ({
  case_: one(cases, { fields: [agentEvents.caseId], references: [cases.id] }),
  session: one(sessions, { fields: [agentEvents.sessionId], references: [sessions.id] }),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  case_: one(cases, { fields: [artifacts.caseId], references: [cases.id] }),
  prdVersion: one(prdVersions, { fields: [artifacts.prdVersionId], references: [prdVersions.id] }),
}));

export const caseCommentsRelations = relations(caseComments, ({ one }) => ({
  case_: one(cases, { fields: [caseComments.caseId], references: [cases.id] }),
  user: one(users, { fields: [caseComments.userId], references: [users.id] }),
}));

export const caseStatusHistoryRelations = relations(caseStatusHistory, ({ one }) => ({
  case_: one(cases, { fields: [caseStatusHistory.caseId], references: [cases.id] }),
  user: one(users, { fields: [caseStatusHistory.userId], references: [users.id] }),
}));
