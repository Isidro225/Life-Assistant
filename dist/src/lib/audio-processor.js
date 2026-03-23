"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioProcessor = void 0;
const prisma_1 = require("./prisma");
const openai_1 = require("./openai");
class AudioProcessor {
    constructor(events) {
        this.events = events;
        this.pendingMeta = null;
        this.queue = Promise.resolve();
    }
    setPendingMeta(meta) {
        const normalized = normalizeMeta(meta);
        if (this.pendingMeta) {
            this.events.onError(this.pendingMeta, "El segmento anterior fue reemplazado antes de recibir audio.");
        }
        this.pendingMeta = normalized;
    }
    enqueueBinary(audioBuffer) {
        const meta = this.pendingMeta;
        if (!meta) {
            throw new Error("Se recibio audio sin metadata previa.");
        }
        this.pendingMeta = null;
        this.events.onReceived(meta);
        this.queue = this.queue.then(async () => {
            this.events.onProcessing(meta);
            try {
                const result = await processSegment(meta, audioBuffer);
                this.events.onProcessed(result);
            }
            catch (error) {
                this.events.onError(meta, toErrorMessage(error));
            }
        });
    }
    async close() {
        this.pendingMeta = null;
        await this.queue;
    }
}
exports.AudioProcessor = AudioProcessor;
async function processSegment(meta, audioBuffer) {
    console.log(`[processor] Procesando ${meta.segmentId} (${audioBuffer.length} bytes, ${meta.mimeType})...`);
    const transcript = await (0, openai_1.transcribeAudio)(audioBuffer, {
        extension: meta.extension,
        mimeType: meta.mimeType,
    });
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
        console.log(`[processor] ${meta.segmentId} sin transcript util.`);
        return {
            segmentId: meta.segmentId,
            transcript: "",
            summary: "",
            tasksCount: 0,
            promisesCount: 0,
            eventsCount: 0,
            createdAt: new Date().toISOString(),
            persisted: false,
        };
    }
    const analysis = await (0, openai_1.analyzeTranscript)(trimmedTranscript);
    const conversation = await prisma_1.prisma.conversation.create({
        data: {
            transcript: trimmedTranscript,
            summary: analysis.summary
                ? { create: { content: analysis.summary } }
                : undefined,
            tasks: {
                create: analysis.tasks.map((task) => ({
                    description: task.description,
                })),
            },
            promises: {
                create: analysis.promises.map((promise) => {
                    var _a;
                    return ({
                        description: promise.description,
                        person: (_a = promise.person) !== null && _a !== void 0 ? _a : null,
                        dueDate: parseOptionalDate(promise.dueDate),
                    });
                }),
            },
            events: {
                create: analysis.events.map((event) => {
                    var _a;
                    return ({
                        title: event.title,
                        date: parseOptionalDate(event.date),
                        location: (_a = event.location) !== null && _a !== void 0 ? _a : null,
                    });
                }),
            },
        },
    });
    console.log(`[processor] ${meta.segmentId} guardado con ${analysis.tasks.length} tareas, ${analysis.promises.length} promesas y ${analysis.events.length} eventos.`);
    return {
        segmentId: meta.segmentId,
        transcript: trimmedTranscript,
        summary: analysis.summary,
        tasksCount: analysis.tasks.length,
        promisesCount: analysis.promises.length,
        eventsCount: analysis.events.length,
        createdAt: conversation.createdAt.toISOString(),
        persisted: true,
    };
}
function normalizeMeta(meta) {
    return {
        segmentId: meta.segmentId.trim(),
        mimeType: meta.mimeType.trim() || "application/octet-stream",
        extension: meta.extension.replace(/^\.+/, "").trim().toLowerCase() || "bin",
    };
}
function parseOptionalDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : "Error desconocido procesando audio.";
}
