import { prisma } from "./prisma";
import { analyzeTranscript, transcribeAudio } from "./openai";

export interface SegmentMeta {
  segmentId: string;
  mimeType: string;
  extension: string;
}

export interface SegmentProcessedResult {
  segmentId: string;
  transcript: string;
  summary: string;
  tasksCount: number;
  promisesCount: number;
  eventsCount: number;
  createdAt: string;
  persisted: boolean;
}

interface AudioProcessorEvents {
  onReceived(meta: SegmentMeta): void;
  onProcessing(meta: SegmentMeta): void;
  onProcessed(result: SegmentProcessedResult): void;
  onError(meta: SegmentMeta, error: string): void;
}

export class AudioProcessor {
  private pendingMeta: SegmentMeta | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly events: AudioProcessorEvents) {}

  setPendingMeta(meta: SegmentMeta) {
    const normalized = normalizeMeta(meta);

    if (this.pendingMeta) {
      this.events.onError(
        this.pendingMeta,
        "El segmento anterior fue reemplazado antes de recibir audio."
      );
    }

    this.pendingMeta = normalized;
  }

  enqueueBinary(audioBuffer: Buffer) {
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
      } catch (error) {
        this.events.onError(meta, toErrorMessage(error));
      }
    });
  }

  async close() {
    this.pendingMeta = null;
    await this.queue;
  }
}

async function processSegment(
  meta: SegmentMeta,
  audioBuffer: Buffer
): Promise<SegmentProcessedResult> {
  console.log(
    `[processor] Procesando ${meta.segmentId} (${audioBuffer.length} bytes, ${meta.mimeType})...`
  );

  const transcript = await transcribeAudio(audioBuffer, {
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

  const analysis = await analyzeTranscript(trimmedTranscript);

  const conversation = await prisma.conversation.create({
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
        create: analysis.promises.map((promise) => ({
          description: promise.description,
          person: promise.person ?? null,
          dueDate: parseOptionalDate(promise.dueDate),
        })),
      },
      events: {
        create: analysis.events.map((event) => ({
          title: event.title,
          date: parseOptionalDate(event.date),
          location: event.location ?? null,
        })),
      },
    },
  });

  console.log(
    `[processor] ${meta.segmentId} guardado con ${analysis.tasks.length} tareas, ${analysis.promises.length} promesas y ${analysis.events.length} eventos.`
  );

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

function normalizeMeta(meta: SegmentMeta): SegmentMeta {
  return {
    segmentId: meta.segmentId.trim(),
    mimeType: meta.mimeType.trim() || "application/octet-stream",
    extension: meta.extension.replace(/^\.+/, "").trim().toLowerCase() || "bin",
  };
}

function parseOptionalDate(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido procesando audio.";
}
