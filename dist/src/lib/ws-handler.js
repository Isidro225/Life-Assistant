"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAudioConnection = handleAudioConnection;
const ws_1 = require("ws");
const audio_processor_1 = require("./audio-processor");
function handleAudioConnection(ws, req) {
    var _a;
    const ip = (_a = req.socket.remoteAddress) !== null && _a !== void 0 ? _a : "unknown";
    console.log(`[ws] Conexion entrante desde ${ip}`);
    const processor = new audio_processor_1.AudioProcessor({
        onReceived(meta) {
            sendMessage(ws, { type: "segment_received", segmentId: meta.segmentId });
        },
        onProcessing(meta) {
            sendMessage(ws, { type: "segment_processing", segmentId: meta.segmentId });
        },
        onProcessed(result) {
            sendMessage(ws, Object.assign({ type: "segment_processed" }, result));
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
            }
            catch (error) {
                sendMessage(ws, {
                    type: "segment_error",
                    segmentId: "unknown",
                    error: toErrorMessage(error),
                });
            }
            return;
        }
        const text = typeof data === "string" ? data : data.toString();
        let message;
        try {
            message = JSON.parse(text);
        }
        catch (_a) {
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
            }
            catch (error) {
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
            }
            catch (error) {
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
function sendMessage(ws, message) {
    if (ws.readyState !== ws_1.WebSocket.OPEN)
        return;
    ws.send(JSON.stringify(message));
}
function isSegmentMetaMessage(value) {
    if (!isRecord(value))
        return false;
    return (value.type === "segment_meta" &&
        typeof value.segmentId === "string" &&
        typeof value.mimeType === "string" &&
        typeof value.extension === "string");
}
function isSegmentUploadMessage(value) {
    if (!isRecord(value))
        return false;
    return (value.type === "segment_upload" &&
        typeof value.segmentId === "string" &&
        typeof value.mimeType === "string" &&
        typeof value.extension === "string" &&
        typeof value.dataBase64 === "string");
}
function getSegmentId(value) {
    return isRecord(value) && typeof value.segmentId === "string"
        ? value.segmentId
        : "unknown";
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : "Error desconocido.";
}
function decodeBase64Audio(message) {
    const payload = message.dataBase64.trim();
    if (!payload) {
        throw new Error("El segmento no contiene audio para procesar.");
    }
    return Buffer.from(payload, "base64");
}
function normalizeBinaryMessage(data) {
    if (Buffer.isBuffer(data))
        return data;
    if (Array.isArray(data))
        return Buffer.concat(data);
    return Buffer.from(new Uint8Array(data));
}
