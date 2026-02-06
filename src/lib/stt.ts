import OpenAI from 'openai';
import { Readable } from 'node:stream';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const sttAvailable = !!OPENAI_API_KEY;

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/**
 * Transcribe an audio buffer using OpenAI Whisper API.
 * Accepts webm/opus audio data.
 * Returns the transcribed text, or null on failure.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  language: string = 'zh',
): Promise<string | null> {
  if (!openai) {
    console.log('[STT] OpenAI API key not configured, skipping transcription');
    return null;
  }

  try {
    // Create a File-like object from the buffer
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language,
      response_format: 'text',
    });

    const text = (typeof response === 'string' ? response : (response as any).text || '').trim();
    if (!text) return null;

    console.log(`[STT] Transcribed ${audioBuffer.length} bytes → "${text.slice(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error('[STT] Transcription error:', err);
    return null;
  }
}
