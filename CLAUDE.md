# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desarrollo local
npm run dev          # Levanta custom server (HTTP + WebSocket) en modo watch

# Producción
npm run build        # Compila Next.js + genera Prisma client
npm start            # Corre el servidor compilado desde dist/server.js

# Base de datos
npx prisma migrate dev    # Aplica migraciones y regenera el client
npx prisma studio         # UI para explorar la DB
npx prisma generate       # Regenerar client sin migrar

# Lint
npm run lint
```

Variables de entorno requeridas: ver `.env.example`.

## Arquitectura

Monolito desplegado en **Railway** con un add-on PostgreSQL. Un solo proceso Node.js levanta:
- El servidor HTTP → manejado por Next.js (App Router)
- Un WebSocket server en `/ws/audio` → recibe audio del wearable/móvil

```
server.ts                    ← Entry point: HTTP + WebSocket
src/
  lib/
    ws-handler.ts            ← Gestión de conexiones WebSocket
    audio-processor.ts       ← Buffer de chunks → flush cada ~30s o 512KB
    openai.ts                ← Whisper (transcripción) + GPT-4o-mini (análisis)
    prisma.ts                ← Singleton de PrismaClient
  app/
    api/
      health/route.ts        ← Healthcheck para Railway
      tasks/route.ts         ← GET / PATCH tareas
      promises/route.ts      ← GET / PATCH promesas
      summary/route.ts       ← GET resúmenes con contexto completo
```

## Pipeline de audio

```
Wearable → BLE → App móvil → WebSocket (/ws/audio)
                                    ↓
                           AudioProcessor (buffer)
                                    ↓ cada 30s o 512KB
                           Whisper API → transcript
                                    ↓
                           GPT-4o-mini → { tasks, promises, events, summary }
                                    ↓
                           PostgreSQL (Prisma)
```

El `AudioProcessor` es por conexión WebSocket. El flush ocurre también al cerrar la conexión para no perder el último segmento.

## Modelos de datos

- **Conversation**: contenedor raíz de cada segmento procesado
- **Task**: acción detectada (ej. "tengo que llamarle")
- **Promise**: compromiso hacia una persona
- **Event**: evento de calendario extraído
- **Summary**: resumen de texto generado por GPT

## Decisiones de diseño relevantes

- **Event-driven, no polling**: el servidor solo trabaja cuando llegan chunks de audio reales
- **gpt-4o-mini**: más barato y suficientemente capaz para extracción estructurada de JSON
- **Un solo servicio en Railway**: evita costos de RAM base de múltiples contenedores
- **tsconfig.server.json**: configuración separada para compilar el custom server en CommonJS (`dist/`) mientras el resto del proyecto usa ESModules de Next.js
