"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.transcribeAudio = transcribeAudio;
exports.analyzeTranscript = analyzeTranscript;
const openai_1 = __importStar(require("openai"));
exports.openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function transcribeAudio(audioBuffer, options) {
    const extension = options.extension.replace(/^\.+/, "").toLowerCase() || "bin";
    const file = await (0, openai_1.toFile)(audioBuffer, `segment.${extension}`, {
        type: options.mimeType,
    });
    const response = await exports.openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "es",
    });
    return response.text;
}
async function analyzeTranscript(transcript) {
    var _a;
    const response = await exports.openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: `Eres un asistente que analiza transcripciones de conversaciones diarias.
Extrae y devuelve un JSON con esta estructura exacta:
{
  "tasks": [{ "description": "..." }],
  "promises": [{ "description": "...", "person": "...", "dueDate": "ISO8601 o null" }],
  "events": [{ "title": "...", "date": "ISO8601 o null", "location": "..." }],
  "summary": "Resumen breve de la conversacion"
}
Solo incluye elementos que esten claramente presentes en la transcripcion.`,
            },
            {
                role: "user",
                content: transcript,
            },
        ],
    });
    const content = (_a = response.choices[0].message.content) !== null && _a !== void 0 ? _a : "{}";
    return normalizeAnalysisResult(safeParseJson(content));
}
function normalizeAnalysisResult(value) {
    const payload = isRecord(value) ? value : {};
    return {
        tasks: normalizeTasks(payload.tasks),
        promises: normalizePromises(payload.promises),
        events: normalizeEvents(payload.events),
        summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    };
}
function normalizeTasks(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        if (!isRecord(item) || typeof item.description !== "string")
            return [];
        const description = item.description.trim();
        return description ? [{ description }] : [];
    });
}
function normalizePromises(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        if (!isRecord(item) || typeof item.description !== "string")
            return [];
        const description = item.description.trim();
        if (!description)
            return [];
        return [
            {
                description,
                person: typeof item.person === "string" && item.person.trim()
                    ? item.person.trim()
                    : undefined,
                dueDate: typeof item.dueDate === "string" && item.dueDate.trim()
                    ? item.dueDate.trim()
                    : undefined,
            },
        ];
    });
}
function normalizeEvents(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        if (!isRecord(item) || typeof item.title !== "string")
            return [];
        const title = item.title.trim();
        if (!title)
            return [];
        return [
            {
                title,
                date: typeof item.date === "string" && item.date.trim()
                    ? item.date.trim()
                    : undefined,
                location: typeof item.location === "string" && item.location.trim()
                    ? item.location.trim()
                    : undefined,
            },
        ];
    });
}
function safeParseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return {};
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
