import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { AudioProcessor } from "./audio-processor";

export function handleAudioConnection(ws: WebSocket, req: IncomingMessage) {
  const ip = req.socket.remoteAddress ?? "unknown";
  console.log(`[ws] Conexión entrante desde ${ip}`);

  const processor = new AudioProcessor();

  ws.on("message", (data: Buffer) => {
    if (Buffer.isBuffer(data)) {
      console.log(`[ws] Chunk recibido: ${data.length} bytes`);
      processor.onChunk(data);
    } else {
      console.log(`[ws] Mensaje no-binario recibido:`, data);
    }
  });

  ws.on("close", async () => {
    console.log(`[ws] Conexión cerrada desde ${ip} — flushing buffer...`);
    await processor.flush();
    processor.destroy();
  });

  ws.on("error", (err) => {
    console.error(`[ws] Error desde ${ip}:`, err.message);
    processor.destroy();
  });

  ws.send(JSON.stringify({ status: "connected" }));
}
