import { useCallback, useEffect, useRef, useState } from "react";

export type WSStatus = "disconnected" | "connecting" | "connected" | "error";

export interface SegmentUploadPayload {
  segmentId: string;
  mimeType: string;
  extension: string;
  dataBase64: string;
}

export interface SegmentProcessedMessage {
  type: "segment_processed";
  segmentId: string;
  transcript: string;
  summary: string;
  tasksCount: number;
  promisesCount: number;
  eventsCount: number;
  createdAt: string;
  persisted: boolean;
}

export type ServerMessage =
  | { type: "connection"; status: "connected" }
  | { type: "segment_received"; segmentId: string }
  | { type: "segment_processing"; segmentId: string }
  | SegmentProcessedMessage
  | { type: "segment_error"; segmentId: string; error: string };

type PendingAck = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type SendSegment = (payload: SegmentUploadPayload) => Promise<void>;

export function useWebSocket(url: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingAcksRef = useRef(new Map<string, PendingAck>());
  const [status, setStatus] = useState<WSStatus>(
    url ? "connecting" : "disconnected"
  );
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearPendingAcks = useCallback((reason: string) => {
    for (const [segmentId, pendingAck] of pendingAcksRef.current) {
      clearTimeout(pendingAck.timer);
      pendingAck.reject(new Error(reason));
      pendingAcksRef.current.delete(segmentId);
    }
  }, []);

  useEffect(() => {
    clearPendingAcks("La conexion WebSocket se reinicio.");
    setLastMessage(null);
    setErrorMessage(null);

    if (!url) {
      setStatus("disconnected");
      socketRef.current = null;
      return;
    }

    let disposed = false;
    let encounteredError = false;

    setStatus("connecting");

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      if (disposed) return;
      setStatus("connecting");
      setErrorMessage(null);
    };

    socket.onmessage = (event) => {
      if (disposed || typeof event.data !== "string") return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isServerMessage(parsed)) return;

      setLastMessage(parsed);

      if (parsed.type === "connection") {
        setStatus("connected");
        setErrorMessage(null);
        return;
      }

      if (parsed.type === "segment_received") {
        const pendingAck = pendingAcksRef.current.get(parsed.segmentId);
        if (!pendingAck) return;

        clearTimeout(pendingAck.timer);
        pendingAck.resolve();
        pendingAcksRef.current.delete(parsed.segmentId);
        return;
      }

      if (parsed.type === "segment_error") {
        const pendingAck = pendingAcksRef.current.get(parsed.segmentId);
        if (!pendingAck) return;

        clearTimeout(pendingAck.timer);
        pendingAck.reject(new Error(parsed.error));
        pendingAcksRef.current.delete(parsed.segmentId);
      }
    };

    socket.onerror = () => {
      if (disposed) return;

      encounteredError = true;
      setStatus("error");
      setErrorMessage("No se pudo establecer conexion con el servidor.");
      clearPendingAcks("No se pudo enviar el segmento al servidor.");
    };

    socket.onclose = () => {
      if (disposed) return;

      setStatus(encounteredError ? "error" : "disconnected");
      setErrorMessage((current) =>
        current ?? "La conexion con el servidor se cerro."
      );
      clearPendingAcks("La conexion con el servidor se cerro.");
    };

    return () => {
      disposed = true;
      socketRef.current = null;
      clearPendingAcks("La conexion WebSocket se cerro.");
      socket.close();
    };
  }, [clearPendingAcks, url]);

  const sendSegment = useCallback<SendSegment>((payload) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error("El WebSocket no esta conectado al momento de enviar.")
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAcksRef.current.delete(payload.segmentId);
        reject(new Error("El servidor no confirmo recepcion del segmento."));
      }, 10_000);

      pendingAcksRef.current.set(payload.segmentId, { resolve, reject, timer });

      try {
        socket.send(
          JSON.stringify({
            type: "segment_upload",
            segmentId: payload.segmentId,
            mimeType: payload.mimeType,
            extension: payload.extension,
            dataBase64: payload.dataBase64,
          })
        );
      } catch (error) {
        clearTimeout(timer);
        pendingAcksRef.current.delete(payload.segmentId);
        reject(
          error instanceof Error
            ? error
            : new Error("No se pudo enviar el segmento por WebSocket.")
        );
      }
    });
  }, []);

  return { status, lastMessage, errorMessage, sendSegment };
}

function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
