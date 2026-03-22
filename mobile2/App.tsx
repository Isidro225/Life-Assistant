import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useWebSocket } from "./src/hooks/useWebSocket";
import { useAudioStream } from "./src/hooks/useAudioStream";

// En desarrollo: tu IP local. En producción: URL de Railway.
const WS_URL = "ws://192.168.1.63:3000/ws/audio";

const STATUS_COLORS: Record<string, string> = {
  connected: "#22c55e",
  connecting: "#f59e0b",
  disconnected: "#6b7280",
  error: "#ef4444",
};

export default function App() {
  const { status, sendBinary } = useWebSocket(WS_URL);
  const { recording, start, stop } = useAudioStream(sendBinary);

  const canRecord = status === "connected";

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <Text style={styles.title}>LifeAssistant</Text>

      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: STATUS_COLORS[status] }]} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          recording ? styles.buttonStop : styles.buttonStart,
          !canRecord && !recording && styles.buttonDisabled,
        ]}
        onPress={recording ? stop : start}
        disabled={!canRecord && !recording}
      >
        <Text style={styles.buttonText}>
          {recording ? "⏹ Detener" : "🎙 Grabar"}
        </Text>
      </TouchableOpacity>

      {recording && (
        <Text style={styles.hint}>Grabando... se envía cada 30 segundos</Text>
      )}

      {!canRecord && !recording && (
        <Text style={styles.hint}>Esperando conexión con el servidor...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f1f5f9",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: "#94a3b8",
    fontSize: 14,
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 50,
  },
  buttonStart: {
    backgroundColor: "#6366f1",
  },
  buttonStop: {
    backgroundColor: "#ef4444",
  },
  buttonDisabled: {
    backgroundColor: "#334155",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
  },
});
