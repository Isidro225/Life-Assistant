import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAudioStream, type AudioPhase } from "./src/hooks/useAudioStream";
import { useWebSocket, type WSStatus } from "./src/hooks/useWebSocket";

const CONNECTION_COLORS: Record<WSStatus, string> = {
  connected: "#34d399",
  connecting: "#f59e0b",
  disconnected: "#64748b",
  error: "#f87171",
};

const PHASE_COLORS: Record<AudioPhase, string> = {
  idle: "#64748b",
  recording: "#38bdf8",
  uploading: "#f59e0b",
  processing: "#a78bfa",
  ready: "#34d399",
  error: "#f87171",
};

const PHASE_LABELS: Record<AudioPhase, string> = {
  idle: "Listo",
  recording: "Grabando",
  uploading: "Subiendo",
  processing: "Procesando",
  ready: "Procesado",
  error: "Error",
};

export default function App() {
  const configuredUrl = getConfiguredWsUrl();
  const configError = validateWebSocketUrl(configuredUrl);
  const wsUrl = configError ? null : configuredUrl;

  const {
    status: connectionStatus,
    lastMessage,
    errorMessage: socketError,
    sendSegment,
  } = useWebSocket(wsUrl);
  const { recording, phase, error, lastResult, start, stop } = useAudioStream({
    sendSegment,
    lastMessage,
  });

  const canRecord = !configError && connectionStatus === "connected";
  const activeError = configError ?? error ?? socketError;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>LifeAssistant</Text>
          <Text style={styles.title}>Captura y procesamiento visibles</Text>
          <Text style={styles.subtitle}>
            La app ahora muestra si se conecto, si subio el audio y que extrajo
            el servidor.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conexion</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: CONNECTION_COLORS[connectionStatus] },
              ]}
            />
            <Text style={styles.statusText}>
              {connectionStatus === "connected"
                ? "Servidor conectado"
                : connectionStatus === "connecting"
                  ? "Conectando con el servidor"
                  : connectionStatus === "error"
                    ? "Error de conexion"
                    : "Desconectado"}
            </Text>
          </View>
          <Text style={styles.helperText}>
            URL activa: {configuredUrl ?? "Sin configurar"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado del audio</Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                {
                  borderColor: PHASE_COLORS[phase],
                  backgroundColor: `${PHASE_COLORS[phase]}1A`,
                },
              ]}
            >
              <Text style={styles.badgeLabel}>Pipeline</Text>
              <Text style={styles.badgeValue}>{PHASE_LABELS[phase]}</Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  borderColor: recording ? "#38bdf8" : "#475569",
                  backgroundColor: recording ? "#38bdf81A" : "#4755691A",
                },
              ]}
            >
              <Text style={styles.badgeLabel}>Microfono</Text>
              <Text style={styles.badgeValue}>
                {recording ? "Activo" : "Detenido"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              recording ? styles.buttonStop : styles.buttonStart,
              !canRecord && !recording && styles.buttonDisabled,
            ]}
            onPress={() => {
              void (recording ? stop() : start());
            }}
            disabled={!canRecord && !recording}
          >
            <Text style={styles.buttonText}>
              {recording ? "Detener grabacion" : "Iniciar grabacion"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            {recording
              ? "Se corta automaticamente cada 30 segundos y cada segmento se envia con confirmacion."
              : canRecord
                ? "Cuando detengas, vas a ver subir, procesar y el ultimo resultado."
                : "La grabacion se habilita cuando exista una URL valida y el servidor responda."}
          </Text>
        </View>

        {activeError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Hay un problema</Text>
            <Text style={styles.errorBody}>{activeError}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ultimo segmento</Text>

          {lastResult ? (
            <>
              <Text style={styles.sectionLabel}>Resumen</Text>
              <Text style={styles.resultText}>
                {lastResult.summary ||
                  "Procesado sin resumen. Revisa la transcripcion."}
              </Text>

              <Text style={styles.sectionLabel}>Transcripcion</Text>
              <Text style={styles.resultText}>
                {lastResult.transcript || "Sin contenido transcribible."}
              </Text>

              <View style={styles.metricRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{lastResult.tasksCount}</Text>
                  <Text style={styles.metricLabel}>Tareas</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {lastResult.promisesCount}
                  </Text>
                  <Text style={styles.metricLabel}>Promesas</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{lastResult.eventsCount}</Text>
                  <Text style={styles.metricLabel}>Eventos</Text>
                </View>
              </View>

              <Text style={styles.helperText}>
                {lastResult.persisted
                  ? `Guardado en servidor: ${formatTimestamp(lastResult.createdAt)}`
                  : "El segmento se proceso, pero no se guardo porque no tuvo transcript util."}
              </Text>
            </>
          ) : (
            <Text style={styles.helperText}>
              Aun no hay segmentos procesados en esta sesion.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getConfiguredWsUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_WS_URL?.trim();
  const fromExpoConfig =
    typeof Constants.expoConfig?.extra?.wsUrl === "string"
      ? Constants.expoConfig.extra.wsUrl.trim()
      : "";

  return fromEnv || fromExpoConfig || null;
}

function validateWebSocketUrl(url: string | null) {
  if (!url) {
    return "Falta EXPO_PUBLIC_WS_URL. Configurala para habilitar la grabacion.";
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return "EXPO_PUBLIC_WS_URL debe usar ws:// o wss://.";
    }

    return null;
  } catch {
    return "EXPO_PUBLIC_WS_URL no tiene un formato valido.";
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#08111f",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
  },
  heroCard: {
    padding: 22,
    borderRadius: 24,
    backgroundColor: "#0f1b33",
    borderWidth: 1,
    borderColor: "#1e293b",
    gap: 8,
  },
  eyebrow: {
    color: "#7dd3fc",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#101a2d",
    borderWidth: 1,
    borderColor: "#1e293b",
    gap: 14,
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  statusText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "600",
  },
  helperText: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 19,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  badge: {
    minWidth: 132,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  badgeLabel: {
    color: "#94a3b8",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  badgeValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: "center",
  },
  buttonStart: {
    backgroundColor: "#0284c7",
  },
  buttonStop: {
    backgroundColor: "#dc2626",
  },
  buttonDisabled: {
    backgroundColor: "#334155",
  },
  buttonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  errorCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#2b0d13",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    gap: 6,
  },
  errorTitle: {
    color: "#fecaca",
    fontSize: 16,
    fontWeight: "700",
  },
  errorBody: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    color: "#7dd3fc",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  resultText: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 21,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#0b1324",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "700",
  },
  metricLabel: {
    color: "#94a3b8",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
