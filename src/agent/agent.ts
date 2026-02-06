import type OpenAI from 'openai';
import { deepseek } from './client.js';
import { agentTools } from './tools/definitions.js';
import { buildSystemPrompt, PRD_SECTION_KEYS } from './prompts/system.js';
import { db } from '../db/index.js';
import { prdVersions, agentEvents } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import type { PrdSection, PrdContent } from '../db/schema.js';

const MAX_TOOL_ITERATIONS = 5;

export interface AgentContext {
  caseId: number;
  sessionId: number;
  leadContext: string;  // formatted lead info string
}

export interface AgentResult {
  reply: string;
  prdUpdated: boolean;
  summary?: {
    summary: string;
    keyDecisions?: string[];
    openQuestions?: string[];
  };
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

/** Get or create draft PRD for a case */
async function getOrCreateDraftPrd(caseId: number): Promise<{ id: number; content: PrdContent; versionNumber: number }> {
  const existing = await db
    .select()
    .from(prdVersions)
    .where(and(eq(prdVersions.caseId, caseId), eq(prdVersions.isLocked, false)))
    .orderBy(desc(prdVersions.versionNumber))
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, content: existing[0].content, versionNumber: existing[0].versionNumber };
  }

  // Create initial draft
  const initialContent: PrdContent = { sections: {}, metadata: { completeness: 0 } };
  const [created] = await db.insert(prdVersions).values({
    caseId,
    versionNumber: 1,
    content: initialContent,
    markdown: '',
    isLocked: false,
  }).returning();

  return { id: created.id, content: initialContent, versionNumber: created.versionNumber };
}

/** Calculate PRD completeness */
function calcCompleteness(sections: PrdSection): number {
  const filled = PRD_SECTION_KEYS.filter(k => sections[k] && sections[k]!.trim().length > 0);
  return Math.round((filled.length / PRD_SECTION_KEYS.length) * 100);
}

/** Generate markdown from PRD sections */
function sectionsToMarkdown(sections: PrdSection): string {
  const labels: Record<string, string> = {
    background: '背景與目標', users: '使用者與情境', scope: '需求範圍',
    asIs: '現況流程（AS-IS）', toBe: '目標流程（TO-BE）', userStories: '功能需求',
    acceptance: '驗收標準', dataModel: '資料與欄位', permissions: '權限與角色',
    nonFunctional: '非功能需求', kpi: '成功指標', risks: '風險與依賴',
    mvpScope: 'MVP 切分建議',
  };
  return PRD_SECTION_KEYS
    .filter(k => sections[k] && sections[k]!.trim().length > 0)
    .map(k => `## ${labels[k]}\n\n${sections[k]}`)
    .join('\n\n---\n\n');
}

/** Run the agent for a single user message */
export async function runAgent(
  ctx: AgentContext,
  conversationHistory: OpenAI.ChatCompletionMessageParam[],
  userMessage: string,
  onStream?: (chunk: string) => void,
): Promise<AgentResult> {
  const prd = await getOrCreateDraftPrd(ctx.caseId);
  const systemPrompt = buildSystemPrompt(ctx.leadContext, prd.content.sections);

  // Build messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let prdUpdated = false;
  let agentSummary: AgentResult['summary'] | undefined;
  const allToolCalls: AgentResult['toolCalls'] = [];

  // Agent loop — handle tool calls iteratively
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLastIteration = i === MAX_TOOL_ITERATIONS - 1;

    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      tools: isLastIteration ? undefined : agentTools,
      tool_choice: isLastIteration ? undefined : 'auto',
      stream: true,
    });

    // Collect streamed response
    let content = '';
    let toolCallsRaw: Array<{
      id: string;
      function: { name: string; arguments: string };
    }> = [];

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onStream?.(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            while (toolCallsRaw.length <= tc.index) {
              toolCallsRaw.push({ id: '', function: { name: '', arguments: '' } });
            }
            if (tc.id) toolCallsRaw[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsRaw[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsRaw[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // If no tool calls, we're done
    if (toolCallsRaw.length === 0 || toolCallsRaw.every(tc => !tc.function.name)) {
      // Log agent event
      await db.insert(agentEvents).values({
        caseId: ctx.caseId,
        sessionId: ctx.sessionId,
        eventType: 'llm_response',
        payload: { model: 'deepseek-chat', reply: content.slice(0, 500) },
      });

      return { reply: content, prdUpdated, summary: agentSummary, toolCalls: allToolCalls };
    }

    // Process tool calls
    const assistantMsg: OpenAI.ChatCompletionMessageParam = {
      role: 'assistant',
      content: content || null,
      tool_calls: toolCallsRaw.filter(tc => tc.function.name).map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
    };
    messages.push(assistantMsg);

    for (const tc of toolCallsRaw) {
      if (!tc.function.name) continue;

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      allToolCalls.push({ name: tc.function.name, args });
      let result = '';

      if (tc.function.name === 'update_prd_section') {
        const sectionKey = args.sectionKey as string;
        const sectionContent = args.content as string;

        if (PRD_SECTION_KEYS.includes(sectionKey as any) && sectionContent) {
          const updatedSections = { ...prd.content.sections, [sectionKey]: sectionContent };
          const completeness = calcCompleteness(updatedSections);
          const markdown = sectionsToMarkdown(updatedSections);

          await db.update(prdVersions)
            .set({
              content: { sections: updatedSections, metadata: { completeness, lastUpdatedSection: sectionKey } },
              markdown,
            })
            .where(eq(prdVersions.id, prd.id));

          prd.content.sections = updatedSections;
          prdUpdated = true;
          result = JSON.stringify({ success: true, sectionKey, completeness });

          await db.insert(agentEvents).values({
            caseId: ctx.caseId, sessionId: ctx.sessionId,
            eventType: 'prd_update',
            payload: { sectionKey, completeness },
          });
        } else {
          result = JSON.stringify({ success: false, error: 'Invalid section key' });
        }
      } else if (tc.function.name === 'summarize_conversation') {
        agentSummary = {
          summary: args.summary as string || '',
          keyDecisions: args.keyDecisions as string[] || [],
          openQuestions: args.openQuestions as string[] || [],
        };
        result = JSON.stringify({ success: true });

        await db.insert(agentEvents).values({
          caseId: ctx.caseId, sessionId: ctx.sessionId,
          eventType: 'summary',
          payload: agentSummary as any,
        });
      } else {
        result = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    // Loop continues — model will see tool results
  }

  return { reply: '（達到最大迭代次數）', prdUpdated, summary: agentSummary, toolCalls: allToolCalls };
}
