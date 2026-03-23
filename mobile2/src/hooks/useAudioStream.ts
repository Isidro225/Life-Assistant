import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import type {
  SegmentProcessedMessage,
  SendSegment,
  ServerMessage,
} from "./useWebSocket";

const SEGMENT_DURATION_MS = 30_000;

export type AudioPhase =
  | "idle"
  | "recording"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

interface UseAudioStreamOptions {
  sendSegment: SendSegment;
  lastMessage: ServerMessage | null;
}

export function useAudioStream({
  sendSegment,
  lastMessage,
}: UseAudioStreamOptions) {
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<AudioPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SegmentProcessedMessage | null>(
    null
  );

  const recorderRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldContinueRef = useRef(false);
  const recordingRef = useRef(false);
  const currentSegmentIdRef = useRef<string | null>(null);
  const actionQueueRef = useRef(Promise.resolve());
  const rotateSegmentRef = useRef<() => void>(() => {});

  const setRecordingState = useCallback((value: boolean) => {
    recordingRef.current = value;
    setRecording(value);
  }, []);

  const clearRotationTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSerial = useCallback(<T,>(task: () => Promise<T>) => {
    const next = actionQueueRef.current.then(task, task);
    actionQueueRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }, []);

  const beginRecorderSegment = useCallback(async () => {
    const { recording: activeRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recorderRef.current = activeRecording;
    clearRotationTimer();

    timerRef.current = setTimeout(() => {
      rotateSegmentRef.current();
    }, SEGMENT_DURATION_MS);
  }, [clearRotationTimer]);

  const uploadSegment = useCallback(
    async (uri: string) => {
      const segmentId = createSegmentId();
      currentSegmentIdRef.current = segmentId;
      setError(null);
      setPhase("uploading");

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      const metadata = inferAudioMetadata(uri);

      await sendSegment({
        segmentId,
        mimeType: metadata.mimeType,
        extension: metadata.extension,
        dataBase64: base64,
      });

      setPhase("processing");
    },
    [sendSegment]
  );

  const finishCurrentSegment = useCallback(
    async (continueRecording: boolean) => {
      const recorder = recorderRef.current;
      if (!recorder) return;

      clearRotationTimer();
      recorderRef.current = null;

      await recorder.stopAndUnloadAsync();
      const uri = recorder.getURI();

      try {
        if (uri) {
          await uploadSegment(uri);
        } else if (!recordingRef.current) {
          setPhase("idle");
        }
      } finally {
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
            () => undefined
          );
        }
      }

      if (continueRecording && shouldContinueRef.current) {
        await beginRecorderSegment();
        setPhase("recording");
      }
    },
    [beginRecorderSegment, clearRotationTimer, uploadSegment]
  );

  const rotateSegment = useCallback(() => {
    void runSerial(async () => {
      if (!recordingRef.current || !shouldContinueRef.current) return;

      try {
        await finishCurrentSegment(true);
      } catch (segmentError) {
        shouldContinueRef.current = false;
        setRecordingState(false);
        setPhase("error");
        setError(toErrorMessage(segmentError));
      }
    });
  }, [finishCurrentSegment, runSerial, setRecordingState]);

  rotateSegmentRef.current = rotateSegment;

  const start = useCallback(() => {
    return runSerial(async () => {
      if (recordingRef.current) return;

      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          throw new Error("Permiso de microfono denegado.");
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        shouldContinueRef.current = true;
        setError(null);
        setPhase("recording");
        setRecordingState(true);

        await beginRecorderSegment();
      } catch (startError) {
        shouldContinueRef.current = false;
        setRecordingState(false);
        setPhase("error");
        setError(toErrorMessage(startError));
      }
    });
  }, [beginRecorderSegment, runSerial, setRecordingState]);

  const stop = useCallback(() => {
    return runSerial(async () => {
      shouldContinueRef.current = false;
      clearRotationTimer();

      if (!recordingRef.current && !recorderRef.current) return;

      setRecordingState(false);

      try {
        await finishCurrentSegment(false);

        if (!currentSegmentIdRef.current) {
          setPhase("idle");
        }
      } catch (stopError) {
        setPhase("error");
        setError(toErrorMessage(stopError));
      }
    });
  }, [clearRotationTimer, finishCurrentSegment, runSerial, setRecordingState]);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "segment_processed") {
      setLastResult(lastMessage);

      if (lastMessage.segmentId === currentSegmentIdRef.current) {
        currentSegmentIdRef.current = null;
        setError(null);
        setPhase(recordingRef.current ? "recording" : "ready");
      }
      return;
    }

    if (
      lastMessage.type === "segment_error" &&
      lastMessage.segmentId === currentSegmentIdRef.current
    ) {
      currentSegmentIdRef.current = null;
      setPhase("error");
      setError(lastMessage.error);
      return;
    }

    if (
      (lastMessage.type === "segment_received" ||
        lastMessage.type === "segment_processing") &&
      lastMessage.segmentId === currentSegmentIdRef.current &&
      !recordingRef.current
    ) {
      setPhase("processing");
    }
  }, [lastMessage]);

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      clearRotationTimer();

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder) {
        void recorder.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [clearRotationTimer]);

  return { recording, phase, error, lastResult, start, stop };
}

function createSegmentId() {
  return `segment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferAudioMetadata(uri: string) {
  const rawExtension = uri.split("?")[0]?.split(".").pop()?.toLowerCase() || "m4a";

  switch (rawExtension) {
    case "m4a":
    case "mp4":
      return { extension: rawExtension, mimeType: "audio/mp4" };
    case "webm":
      return { extension: "webm", mimeType: "audio/webm" };
    case "wav":
      return { extension: "wav", mimeType: "audio/wav" };
    case "caf":
      return { extension: "caf", mimeType: "audio/x-caf" };
    case "aac":
      return { extension: "aac", mimeType: "audio/aac" };
    default:
      return {
        extension: rawExtension,
        mimeType: "application/octet-stream",
      };
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Error desconocido durante la grabacion.";
}
