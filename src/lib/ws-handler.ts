import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import {
  AudioProcessor,
  type SegmentMeta,
  type SegmentProcessedResult,
} from "./audio-processor";

interface SegmentMetaMessage extends SegmentMeta {
  type: "segment_meta";
}

interface SegmentUploadMessage extends SegmentMeta {
  type: "segment_upload";
  dataBase64: string;
}

type ServerMessage =
  | { type: "connection"; status: "connected" }
  | { type: "segment_received"; segmentId: string }
  | { type: "segment_processing"; segmentId: string }
  | ({ type: "segment_processed" } & SegmentProcessedResult)
  | { type: "segment_error"; segmentId: string; error: string };

export function handleAudioConnection(ws: WebSocket, req: IncomingMessage) {
  const ip = req.socket.remoteAddress ?? "unknown";
  console.log(`[ws] Conexion entrante desde ${ip}`);

  const processor = new AudioProcessor({
    onReceived(meta) {
      sendMessage(ws, { type: "segment_received", segmentId: meta.segmentId });
    },
    onProcessing(meta) {
      sendMessage(ws, { type: "segment_processing", segmentId: meta.segmentId });
    },
    onProcessed(result) {
      sendMessage(ws, { type: "segment_processed", ...result });
    },
    onError(meta, error) {
      console.error(`[ws] Error en ${meta.segmentId}: ${error}`);
      sendMessage(ws, {
        type: "segment_error",
        segmentId: meta.segmentId,
        error,
      });
    },
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      try {
        const buffer = normalizeBinaryMessage(data);
        processor.enqueueBinary(buffer);
      } catch (error) {
        sendMessage(ws, {
          type: "segment_error",
          segmentId: "unknown",
          error: toErrorMessage(error),
        });
      }
      return;
    }

    const text = typeof data === "string" ? data : data.toString();

    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      sendMessage(ws, {
        type: "segment_error",
        segmentId: "unknown",
        error: "Mensaje JSON invalido.",
      });
      return;
    }

    if (isSegmentMetaMessage(message)) {
      try {
        processor.setPendingMeta(message);
      } catch (error) {
        sendMessage(ws, {
          type: "segment_error",
          segmentId: message.segmentId,
          error: toErrorMessage(error),
        });
      }
      return;
    }

    if (isSegmentUploadMessage(message)) {
      try {
        processor.setPendingMeta(message);
        processor.enqueueBinary(decodeBase64Audio(message));
      } catch (error) {
        sendMessage(ws, {
          type: "segment_error",
          segmentId: message.segmentId,
          error: toErrorMessage(error),
        });
      }
      return;
    }

    sendMessage(ws, {
      type: "segment_error",
      segmentId: getSegmentId(message),
      error: "Mensaje no soportado por el servidor.",
    });
  });

  ws.on("close", () => {
    console.log(`[ws] Conexion cerrada desde ${ip}`);
    void processor.close().catch((error) => {
      console.error(`[ws] Error cerrando procesador para ${ip}:`, error);
    });
  });

  ws.on("error", (error) => {
    console.error(`[ws] Error desde ${ip}:`, error.message);
    void processor.close().catch((closeError) => {
      console.error(`[ws] Error finalizando procesador para ${ip}:`, closeError);
    });
  });

  sendMessage(ws, { type: "connection", status: "connected" });
}

function sendMessage(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function isSegmentMetaMessage(value: unknown): value is SegmentMetaMessage {
  if (!isRecord(value)) return false;

  return (
    value.type === "segment_meta" &&
    typeof value.segmentId === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.extension === "string"
  );
}

function isSegmentUploadMessage(value: unknown): value is SegmentUploadMessage {
  if (!isRecord(value)) return false;

  return (
    value.type === "segment_upload" &&
    typeof value.segmentId === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.extension === "string" &&
    typeof value.dataBase64 === "string"
  );
}

function getSegmentId(value: unknown) {
  return isRecord(value) && typeof value.segmentId === "string"
    ? value.segmentId
    : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido.";
}

function decodeBase64Audio(message: SegmentUploadMessage) {
  const payload = message.dataBase64.trim();
  if (!payload) {
    throw new Error("El segmento no contiene audio para procesar.");
  }

  return Buffer.from(payload, "base64");
}

function normalizeBinaryMessage(data: ArrayBuffer | Buffer | Buffer[]) {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(new Uint8Array(data));
}
