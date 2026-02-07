import type OpenAI from 'openai';
import { deepseek } from './client.js';
import { intakeTools } from './tools/intake-tools.js';
import {
  buildIntakeSystemPrompt,
  emptyIntakeData,
  INTAKE_FIELDS,
  type IntakeData,
} from './prompts/intake-system.js';

const MAX_TOOL_ITERATIONS = 3;
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface IntakeSession {
  messages: OpenAI.ChatCompletionMessageParam[];
  data: IntakeData;
  isComplete: boolean;
  summary: string;
  turnCount: number;
  lastActivity: number;
}

// In-memory sessions keyed by clientId
const intakeSessions = new Map<string, IntakeSession>();

// Cleanup stale sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of intakeSessions) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      intakeSessions.delete(id);
    }
  }
}, 60_000);

export function createIntakeSession(clientId: string): IntakeSession {
  const session: IntakeSession = {
    messages: [],
    data: { ...emptyIntakeData },
    isComplete: false,
    summary: '',
    turnCount: 0,
    lastActivity: Date.now(),
  };
  intakeSessions.set(clientId, session);
  return session;
}

export function getIntakeSession(clientId: string): IntakeSession | undefined {
  const session = intakeSessions.get(clientId);
  if (session) session.lastActivity = Date.now();
  return session;
}

export function deleteIntakeSession(clientId: string): void {
  intakeSessions.delete(clientId);
}

function calcCompleteness(data: IntakeData): number {
  const filled = INTAKE_FIELDS.filter(f => data[f.key]?.trim().length > 0);
  return Math.round((filled.length / INTAKE_FIELDS.length) * 100);
}

export interface IntakeAgentResult {
  reply: string;
  data: IntakeData;
  isComplete: boolean;
  summary: string;
  completeness: number;
}

export async function runIntakeAgent(
  clientId: string,
  userMessage: string,
  onStream?: (chunk: string) => void,
): Promise<IntakeAgentResult> {
  const session = intakeSessions.get(clientId);
  if (!session) {
    throw new Error('Intake session not found');
  }

  session.lastActivity = Date.now();
  session.turnCount++;

  const systemPrompt = buildIntakeSystemPrompt(session.data);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...session.messages,
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const isLastIteration = i === MAX_TOOL_ITERATIONS - 1;

    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      tools: isLastIteration ? undefined : intakeTools,
      tool_choice: isLastIteration ? undefined : 'auto',
      stream: true,
    });

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

    // No tool calls — done
    if (toolCallsRaw.length === 0 || toolCallsRaw.every(tc => !tc.function.name)) {
      // Save to conversation history
      session.messages.push({ role: 'user', content: userMessage });
      session.messages.push({ role: 'assistant', content });

      return {
        reply: content,
        data: { ...session.data },
        isComplete: session.isComplete,
        summary: session.summary,
        completeness: calcCompleteness(session.data),
      };
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

      let result = '';

      if (tc.function.name === 'update_intake') {
        const validKeys = ['background', 'currentState', 'painPoints', 'expectedOutcome'] as const;
        const updated: string[] = [];
        for (const key of validKeys) {
          if (typeof args[key] === 'string' && args[key]) {
            session.data[key] = args[key] as string;
            updated.push(key);
          }
        }
        result = JSON.stringify({
          success: true,
          updated,
          completeness: calcCompleteness(session.data),
        });
      } else if (tc.function.name === 'mark_complete') {
        session.isComplete = true;
        session.summary = (args.summary as string) || '';
        result = JSON.stringify({ success: true, summary: session.summary });
      } else {
        result = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    // Loop continues
  }

  // Save history even on max iterations
  session.messages.push({ role: 'user', content: userMessage });
  session.messages.push({ role: 'assistant', content: '讓我整理一下您說的內容...' });

  return {
    reply: '讓我整理一下您說的內容...',
    data: { ...session.data },
    isComplete: session.isComplete,
    summary: session.summary,
    completeness: calcCompleteness(session.data),
  };
}
