import OpenAI from "openai";
import { Readable } from "stream";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const stream = Readable.from(audioBuffer) as unknown as { path: string } & NodeJS.ReadableStream;
  stream.path = "audio.webm";

  const response = await openai.audio.transcriptions.create({
    file: stream as unknown as File,
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
  "summary": "Resumen breve de la conversación"
}
Solo incluye elementos que estén claramente presentes en la transcripción.`,
      },
      {
        role: "user",
        content: transcript,
      },
    ],
  });

  const content = response.choices[0].message.content ?? "{}";
  return JSON.parse(content) as AnalysisResult;
}
