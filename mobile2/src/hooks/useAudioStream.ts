import { useState, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

const SEGMENT_DURATION_MS = 30_000;

export function useAudioStream(onSegment: (data: ArrayBuffer) => void) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startSegment = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) throw new Error("Permiso de micrófono denegado");

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recorderRef.current = recording;

    timerRef.current = setTimeout(() => rotateSegment(), SEGMENT_DURATION_MS);
  }, []);

  const rotateSegment = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    await recorder.stopAndUnloadAsync();
    const uri = recorder.getURI();

    if (uri) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = base64ToArrayBuffer(base64);
      onSegment(binary);
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }

    recorderRef.current = null;
    await startSegment();
  }, [onSegment, startSegment]);

  const start = useCallback(async () => {
    setRecording(true);
    await startSegment();
  }, [startSegment]);

  const stop = useCallback(async () => {
    setRecording(false);
    if (timerRef.current) clearTimeout(timerRef.current);

    const recorder = recorderRef.current;
    if (!recorder) return;

    await recorder.stopAndUnloadAsync();
    const uri = recorder.getURI();

    if (uri) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = base64ToArrayBuffer(base64);
      onSegment(binary);
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }

    recorderRef.current = null;
  }, [onSegment]);

  return { recording, start, stop };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}
