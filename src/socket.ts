import type { Server as SocketIOServer, Socket } from 'socket.io';
import type OpenAI from 'openai';
import { verifyToken } from './lib/auth.js';
import { runAgent, type AgentContext } from './agent/agent.js';
import { db } from './db/index.js';
import { leads, cases, sessions, transcripts } from './db/schema.js';
import { eq } from 'drizzle-orm';

// In-memory conversation history per session
const sessionHistories = new Map<number, OpenAI.ChatCompletionMessageParam[]>();
// Sequence counter per session
const sessionSeqCounters = new Map<number, number>();

export function setupSocketIO(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    let currentSessionId: number | null = null;
    let currentCaseId: number | null = null;

    // Auth check
    socket.on('auth', (token: string, callback: (ok: boolean) => void) => {
      try {
        verifyToken(token);
        callback(true);
      } catch {
        callback(false);
      }
    });

    // Join interview session
    socket.on('joinSession', async (data: { sessionId: number; caseId: number }) => {
      currentSessionId = data.sessionId;
      currentCaseId = data.caseId;
      const room = `session:${data.sessionId}`;
      await socket.join(room);

      // Initialize history if not exists
      if (!sessionHistories.has(data.sessionId)) {
        sessionHistories.set(data.sessionId, []);
      }
      if (!sessionSeqCounters.has(data.sessionId)) {
        // Load existing transcript count
        const existing = await db.select().from(transcripts).where(eq(transcripts.sessionId, data.sessionId));
        sessionSeqCounters.set(data.sessionId, existing.length);
      }

      socket.emit('sessionJoined', { sessionId: data.sessionId });
    });

    // Chat message from consultant
    socket.on('chatMessage', async (data: { message: string }) => {
      if (!currentSessionId || !currentCaseId) {
        socket.emit('error', { message: '未加入訪談' });
        return;
      }

      const room = `session:${currentSessionId}`;
      const seq = sessionSeqCounters.get(currentSessionId) || 0;

      // Save user transcript
      await db.insert(transcripts).values({
        sessionId: currentSessionId,
        speaker: 'consultant',
        content: data.message,
        startMs: 0,
        endMs: 0,
        sequenceNumber: seq,
      });
      sessionSeqCounters.set(currentSessionId, seq + 1);

      // Broadcast user message to room
      io.to(room).emit('message', {
        role: 'user',
        content: data.message,
        timestamp: new Date().toISOString(),
      });

      // Build lead context
      const [caseRow] = await db.select().from(cases).where(eq(cases.id, currentCaseId)).limit(1);
      let leadContext = '';
      if (caseRow) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, caseRow.leadId)).limit(1);
        if (lead) {
          leadContext = [
            `公司: ${lead.company}`,
            `聯絡人: ${lead.contactName}${lead.title ? ` (${lead.title})` : ''}`,
            `規模: ${lead.companySize}`,
            lead.industry ? `產業: ${lead.industry}` : '',
            `需求類型: ${lead.needTypes.join('、')}`,
            lead.description ? `需求描述: ${lead.description}` : '',
            lead.painPoints ? `痛點: ${lead.painPoints}` : '',
            lead.expectedOutcome ? `期望成果: ${lead.expectedOutcome}` : '',
            lead.existingTools ? `現有工具: ${lead.existingTools}` : '',
          ].filter(Boolean).join('\n');
        }
      }

      const ctx: AgentContext = {
        caseId: currentCaseId,
        sessionId: currentSessionId,
        leadContext,
      };

      const history = sessionHistories.get(currentSessionId) || [];

      // Signal agent is typing
      io.to(room).emit('agentTyping', true);

      try {
        let streamedContent = '';
        const result = await runAgent(ctx, history, data.message, (chunk) => {
          streamedContent += chunk;
          io.to(room).emit('agentStream', { chunk });
        });

        io.to(room).emit('agentTyping', false);

        // Emit complete agent message
        io.to(room).emit('message', {
          role: 'agent',
          content: result.reply,
          timestamp: new Date().toISOString(),
        });

        // Save agent transcript
        const agentSeq = sessionSeqCounters.get(currentSessionId) || 0;
        await db.insert(transcripts).values({
          sessionId: currentSessionId,
          speaker: 'agent',
          content: result.reply,
          startMs: 0,
          endMs: 0,
          sequenceNumber: agentSeq,
        });
        sessionSeqCounters.set(currentSessionId, agentSeq + 1);

        // Update conversation history
        history.push({ role: 'user', content: data.message });
        history.push({ role: 'assistant', content: result.reply });
        sessionHistories.set(currentSessionId, history);

        // Notify PRD update
        if (result.prdUpdated) {
          io.to(room).emit('prdUpdated', { caseId: currentCaseId });
        }

        // Notify summary
        if (result.summary) {
          io.to(room).emit('agentSummary', result.summary);
        }

        // Notify tool calls
        if (result.toolCalls.length > 0) {
          io.to(room).emit('toolCalls', result.toolCalls);
        }
      } catch (err) {
        console.error('[Agent] Error:', err);
        io.to(room).emit('agentTyping', false);
        io.to(room).emit('error', { message: 'Agent 處理錯誤，請重試' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
