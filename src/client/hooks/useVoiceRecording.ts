import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceRecordingOptions {
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onStop?: () => void;
  chunkIntervalMs?: number;
}

interface UseVoiceRecordingResult {
  isRecording: boolean;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingResult {
  const { onAudioChunk, onStop, chunkIntervalMs = 500 } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(() =>
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const onAudioChunkRef = useRef(onAudioChunk);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
    onStopRef.current = onStop;
  }, [onAudioChunk, onStop]);

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        e.data.arrayBuffer().then(buf => onAudioChunkRef.current?.(buf));
      }
    };

    recorder.start(chunkIntervalMs);
    setIsRecording(true);
  }, [isSupported, isRecording, chunkIntervalMs]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    onStopRef.current?.();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return { isRecording, isSupported, startRecording, stopRecording };
}
