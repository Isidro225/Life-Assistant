import { useEffect, useRef, useState } from "react";

export type WSStatus = "disconnected" | "connecting" | "connected" | "error";

export function useWebSocket(url: string) {
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WSStatus>("disconnected");

  useEffect(() => {
    setStatus("connecting");
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => setStatus("connected");
    socket.onerror = () => setStatus("error");
    socket.onclose = () => setStatus("disconnected");

    ws.current = socket;

    return () => {
      socket.close();
    };
  }, [url]);

  function sendBinary(data: ArrayBuffer) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(data);
    }
  }

  return { status, sendBinary };
}
