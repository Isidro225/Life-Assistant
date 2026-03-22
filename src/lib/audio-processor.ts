import { transcribeAudio, analyzeTranscript } from "./openai";
import { prisma } from "./prisma";

const SEGMENT_SIZE_BYTES = 512 * 1024; // ~30s de audio a baja calidad
const SEGMENT_TIMEOUT_MS = 30_000;

export class AudioProcessor {
  private buffer: Buffer[] = [];
  private totalSize = 0;
  private timer: NodeJS.Timeout | null = null;

  onChunk(chunk: Buffer) {
    this.buffer.push(chunk);
    this.totalSize += chunk.length;

    if (this.totalSize >= SEGMENT_SIZE_BYTES) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), SEGMENT_TIMEOUT_MS);
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const audioBuffer = Buffer.concat(this.buffer);
    this.buffer = [];
    this.totalSize = 0;

    await processSegment(audioBuffer);
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}

async function processSegment(audioBuffer: Buffer) {
  console.log(`[processor] Procesando segmento de ${audioBuffer.length} bytes...`);
  try {
    const transcript = await transcribeAudio(audioBuffer);
    console.log(`[processor] Transcript: "${transcript}"`);

    if (!transcript.trim()) {
      console.log("[processor] Transcript vacío, ignorando.");
      return;
    }

    const analysis = await analyzeTranscript(transcript);

    await prisma.conversation.create({
      data: {
        transcript,
        summary: analysis.summary
          ? { create: { content: analysis.summary } }
          : undefined,
        tasks: {
          create: analysis.tasks.map((t) => ({ description: t.description })),
        },
        promises: {
          create: analysis.promises.map((p) => ({
            description: p.description,
            person: p.person,
            dueDate: p.dueDate ? new Date(p.dueDate) : null,
          })),
        },
        events: {
          create: analysis.events.map((e) => ({
            title: e.title,
            date: e.date ? new Date(e.date) : null,
            location: e.location,
          })),
        },
      },
    });

    console.log(`[processor] Segmento guardado. Transcript: "${transcript.slice(0, 60)}..."`);
  } catch (err) {
    console.error("[processor] Error procesando segmento:", err);
  }
}
