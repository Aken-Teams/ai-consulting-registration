import type { Server as SocketIOServer, Socket } from 'socket.io';
import type OpenAI from 'openai';
import { verifyToken } from './lib/auth.js';
import { runAgent, type AgentContext } from './agent/agent.js';
import { transcribeAudio, sttAvailable } from './lib/stt.js';
import {
  createIntakeSession,
  getIntakeSession,
  deleteIntakeSession,
  runIntakeAgent,
} from './agent/intake-agent.js';
import { db } from './db/index.js';
import { leads, cases, sessions, transcripts, artifacts } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', 'data', 'artifacts');

// Rate limiting for intake: per IP, 3 sessions/hr, 10 turns/session
const intakeRateMap = new Map<string, { count: number; resetAt: number }>();
const INTAKE_MAX_SESSIONS_PER_HOUR = 3;
const INTAKE_MAX_TURNS = 10;

// In-memory conversation history per session
const sessionHistories = new Map<number, OpenAI.ChatCompletionMessageParam[]>();
// Sequence counter per session
const sessionSeqCounters = new Map<number, number>();
// Audio buffer accumulator per session (for chunk-based recording)
const sessionAudioBuffers = new Map<number, Buffer[]>();
// Full recording accumulator per session
const sessionRecordings = new Map<number, Buffer[]>();

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

      socket.emit('sessionJoined', { sessionId: data.sessionId, sttAvailable });
    });

    // Chat message from consultant
    socket.on('chatMessage', async (data: { message: string }) => {
      if (!currentSessionId || !currentCaseId) {
        socket.emit('error', { message: '未加入訪談' });
        return;
      }

      await handleUserMessage(io, currentSessionId, currentCaseId, data.message);
    });

    // Audio chunk from browser MediaRecorder
    socket.on('audioChunk', async (data: { chunk: ArrayBuffer }) => {
      if (!currentSessionId || !currentCaseId) {
        socket.emit('error', { message: '未加入訪談' });
        return;
      }

      const buf = Buffer.from(data.chunk);

      // Accumulate for STT processing
      if (!sessionAudioBuffers.has(currentSessionId)) {
        sessionAudioBuffers.set(currentSessionId, []);
      }
      sessionAudioBuffers.get(currentSessionId)!.push(buf);

      // Accumulate for full recording save
      if (!sessionRecordings.has(currentSessionId)) {
        sessionRecordings.set(currentSessionId, []);
      }
      sessionRecordings.get(currentSessionId)!.push(buf);
    });

    // Audio recording stopped — process accumulated audio
    socket.on('audioStop', async () => {
      if (!currentSessionId || !currentCaseId) return;

      const room = `session:${currentSessionId}`;
      const chunks = sessionAudioBuffers.get(currentSessionId) || [];
      sessionAudioBuffers.set(currentSessionId, []);

      if (chunks.length === 0) return;

      const audioBuffer = Buffer.concat(chunks);
      io.to(room).emit('sttProcessing', true);

      try {
        const text = await transcribeAudio(audioBuffer);
        io.to(room).emit('sttProcessing', false);

        if (text) {
          // Emit the transcription to the client for review/edit
          io.to(room).emit('sttResult', { text });
        } else {
          io.to(room).emit('sttResult', { text: null, error: '無法辨識語音' });
        }
      } catch (err) {
        console.error('[STT] Processing error:', err);
        io.to(room).emit('sttProcessing', false);
        io.to(room).emit('sttResult', { text: null, error: '語音轉文字失敗' });
      }
    });

    // Send transcribed text as a chat message (user confirms)
    socket.on('sendTranscription', async (data: { text: string }) => {
      if (!currentSessionId || !currentCaseId) {
        socket.emit('error', { message: '未加入訪談' });
        return;
      }

      await handleUserMessage(io, currentSessionId, currentCaseId, data.text);
    });

    // ─── Intake (public, no auth required) ───
    let intakeClientId: string | null = null;
    const intakeAudioBuffers: Buffer[] = [];

    socket.on('intakeStart', (callback: (data: { clientId: string; sttAvailable: boolean }) => void) => {
      const ip = socket.handshake.address;
      const now = Date.now();

      // Rate limit check
      const rate = intakeRateMap.get(ip);
      if (rate) {
        if (now > rate.resetAt) {
          rate.count = 0;
          rate.resetAt = now + 3600_000;
        }
        if (rate.count >= INTAKE_MAX_SESSIONS_PER_HOUR) {
          socket.emit('intakeError', { message: '操作過於頻繁，請稍後再試' });
          return;
        }
        rate.count++;
      } else {
        intakeRateMap.set(ip, { count: 1, resetAt: now + 3600_000 });
      }

      intakeClientId = randomUUID();
      createIntakeSession(intakeClientId);
      console.log(`[Intake] Session started: ${intakeClientId}`);
      callback({ clientId: intakeClientId, sttAvailable });
    });

    socket.on('intakeAudioChunk', (data: { chunk: ArrayBuffer }) => {
      if (!intakeClientId) return;
      intakeAudioBuffers.push(Buffer.from(data.chunk));
    });

    socket.on('intakeAudioStop', async () => {
      if (!intakeClientId) return;

      const chunks = intakeAudioBuffers.splice(0);
      if (chunks.length === 0) return;

      const audioBuffer = Buffer.concat(chunks);
      socket.emit('intakeSttProcessing', true);

      try {
        const text = await transcribeAudio(audioBuffer);
        socket.emit('intakeSttProcessing', false);

        if (text) {
          socket.emit('intakeSttResult', { text });
        } else {
          socket.emit('intakeSttResult', { text: null, error: '無法辨識語音' });
        }
      } catch (err) {
        console.error('[Intake STT] Error:', err);
        socket.emit('intakeSttProcessing', false);
        socket.emit('intakeSttResult', { text: null, error: '語音轉文字失敗' });
      }
    });

    socket.on('intakeMessage', async (data: { message: string }) => {
      if (!intakeClientId) {
        socket.emit('intakeError', { message: '請先開始對話' });
        return;
      }

      const session = getIntakeSession(intakeClientId);
      if (!session) {
        socket.emit('intakeError', { message: '對話已過期，請重新開始' });
        return;
      }

      if (session.turnCount >= INTAKE_MAX_TURNS) {
        socket.emit('intakeError', { message: '已達對話上限，請繼續填寫報名表' });
        return;
      }

      socket.emit('intakeAgentTyping', true);

      try {
        const result = await runIntakeAgent(intakeClientId, data.message, (chunk) => {
          socket.emit('intakeAgentStream', { chunk });
        });

        socket.emit('intakeAgentTyping', false);

        socket.emit('intakeMessage', {
          role: 'agent',
          content: result.reply,
          timestamp: new Date().toISOString(),
        });

        socket.emit('intakeDataUpdate', {
          data: result.data,
          completeness: result.completeness,
          isComplete: result.isComplete,
          summary: result.summary,
        });
      } catch (err) {
        console.error('[Intake Agent] Error:', err);
        socket.emit('intakeAgentTyping', false);
        socket.emit('intakeError', { message: '處理錯誤，請重試' });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);

      // Cleanup intake session
      if (intakeClientId) {
        deleteIntakeSession(intakeClientId);
        intakeClientId = null;
      }

      // Save recording if exists
      if (currentSessionId && currentCaseId) {
        const recording = sessionRecordings.get(currentSessionId);
        if (recording && recording.length > 0) {
          try {
            await mkdir(ARTIFACTS_DIR, { recursive: true });
            const filename = `recording_session_${currentSessionId}_${Date.now()}.webm`;
            const storagePath = join(ARTIFACTS_DIR, filename);
            const fullRecording = Buffer.concat(recording);
            await writeFile(storagePath, fullRecording);

            await db.insert(artifacts).values({
              caseId: currentCaseId,
              filename,
              mimeType: 'audio/webm',
              sizeBytes: fullRecording.length,
              storagePath,
            });

            console.log(`[Recording] Saved ${fullRecording.length} bytes for session ${currentSessionId}`);
          } catch (err) {
            console.error('[Recording] Save error:', err);
          }
        }

        // Cleanup
        sessionAudioBuffers.delete(currentSessionId);
        sessionRecordings.delete(currentSessionId);
      }
    });
  });

  /** Shared handler for user messages (typed or transcribed) */
  async function handleUserMessage(io: SocketIOServer, sessionId: number, caseId: number, message: string) {
    const room = `session:${sessionId}`;
    const seq = sessionSeqCounters.get(sessionId) || 0;

    // Save user transcript
    await db.insert(transcripts).values({
      sessionId,
      speaker: 'consultant',
      content: message,
      startMs: 0,
      endMs: 0,
      sequenceNumber: seq,
    });
    sessionSeqCounters.set(sessionId, seq + 1);

    // Broadcast user message to room
    io.to(room).emit('message', {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Build lead context
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
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

    const ctx: AgentContext = { caseId, sessionId, leadContext };
    const history = sessionHistories.get(sessionId) || [];

    // Signal agent is typing
    io.to(room).emit('agentTyping', true);

    try {
      let streamedContent = '';
      const result = await runAgent(ctx, history, message, (chunk) => {
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
      const agentSeq = sessionSeqCounters.get(sessionId) || 0;
      await db.insert(transcripts).values({
        sessionId,
        speaker: 'agent',
        content: result.reply,
        startMs: 0,
        endMs: 0,
        sequenceNumber: agentSeq,
      });
      sessionSeqCounters.set(sessionId, agentSeq + 1);

      // Update conversation history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: result.reply });
      sessionHistories.set(sessionId, history);

      // Notify PRD update
      if (result.prdUpdated) {
        io.to(room).emit('prdUpdated', { caseId });
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
  }
}
