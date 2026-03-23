import OpenAI, { toFile } from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TranscriptionOptions {
  extension: string;
  mimeType: string;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  options: TranscriptionOptions
): Promise<string> {
  const extension = options.extension.replace(/^\.+/, "").toLowerCase() || "bin";
  const file = await toFile(audioBuffer, `segment.${extension}`, {
    type: options.mimeType,
  });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "es",
  });

  return response.text;
}

interface AnalysisResult {
  tasks: { description: string }[];
  promises: { description: string; person?: string; dueDate?: string }[];
  events: { title: string; date?: string; location?: string }[];
  summary: string;
}

export async function analyzeTranscript(
  transcript: string
): Promise<AnalysisResult> {
  const response = await openai.chat.completions.create({
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

  const content = response.choices[0].message.content ?? "{}";
  return normalizeAnalysisResult(safeParseJson(content));
}

function normalizeAnalysisResult(value: unknown): AnalysisResult {
  const payload = isRecord(value) ? value : {};

  return {
    tasks: normalizeTasks(payload.tasks),
    promises: normalizePromises(payload.promises),
    events: normalizeEvents(payload.events),
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
  };
}

function normalizeTasks(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.description !== "string") return [];
    const description = item.description.trim();
    return description ? [{ description }] : [];
  });
}

function normalizePromises(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.description !== "string") return [];

    const description = item.description.trim();
    if (!description) return [];

    return [
      {
        description,
        person:
          typeof item.person === "string" && item.person.trim()
            ? item.person.trim()
            : undefined,
        dueDate:
          typeof item.dueDate === "string" && item.dueDate.trim()
            ? item.dueDate.trim()
            : undefined,
      },
    ];
  });
}

function normalizeEvents(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.title !== "string") return [];

    const title = item.title.trim();
    if (!title) return [];

    return [
      {
        title,
        date:
          typeof item.date === "string" && item.date.trim()
            ? item.date.trim()
            : undefined,
        location:
          typeof item.location === "string" && item.location.trim()
            ? item.location.trim()
            : undefined,
      },
    ];
  });
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
