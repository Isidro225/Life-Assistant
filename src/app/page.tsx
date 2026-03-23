"use client";

import { useEffect, useState, type ReactNode } from "react";

type Task = {
  id: string;
  description: string;
  completed: boolean;
  createdAt: string;
};

type PromiseItem = {
  id: string;
  description: string;
  person: string | null;
  fulfilled: boolean;
  createdAt: string;
};

type EventItem = {
  id: string;
  title: string;
  date: string | null;
  location: string | null;
};

type SummaryItem = {
  id: string;
  content: string;
  date: string;
  conversation: {
    id: string;
    createdAt: string;
    transcript: string | null;
    tasks: Task[];
    promises: PromiseItem[];
    events: EventItem[];
  };
};

type DashboardState = {
  summaries: SummaryItem[];
  tasks: Task[];
  promises: PromiseItem[];
};

const POLL_INTERVAL_MS = 5_000;

export default function Home() {
  const [data, setData] = useState<DashboardState>({
    summaries: [],
    tasks: [],
    promises: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard(initial: boolean) {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [summaries, tasks, promises] = await Promise.all([
          fetchJson<SummaryItem[]>("/api/summary"),
          fetchJson<Task[]>("/api/tasks"),
          fetchJson<PromiseItem[]>("/api/promises"),
        ]);

        if (!active) return;

        setData({ summaries, tasks, promises });
        setError(null);
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!active) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo refrescar el dashboard."
        );
      } finally {
        if (!active) return;

        setLoading(false);
        setRefreshing(false);
      }
    }

    void loadDashboard(true);

    const interval = setInterval(() => {
      void loadDashboard(false);
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const totalEvents = data.summaries.reduce(
    (count, summary) => count + summary.conversation.events.length,
    0
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#15314b_0%,#08111f_42%,#f6efe4_42%,#f8f3eb_100%)] text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8 md:py-10">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/85 p-8 text-slate-50 shadow-[0_30px_80px_rgba(3,7,18,0.45)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                LifeAssistant
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Estado real del pipeline de voz
              </h1>
              <p className="max-w-xl text-sm leading-6 text-slate-300 md:text-base">
                Esta vista confirma si los segmentos ya fueron procesados y que
                informacion util termino guardada despues de grabar desde el
                telefono.
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
              <div className="font-medium">
                {refreshing ? "Actualizando..." : "Dashboard activo"}
              </div>
              <div className="text-cyan-100/80">
                {lastUpdated
                  ? `Ultima actualizacion: ${formatDate(lastUpdated.toISOString())}`
                  : "Esperando primera carga"}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900 shadow-sm">
            <p className="text-sm font-semibold">No se pudo refrescar el estado</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Resumenes"
            value={data.summaries.length}
            accent="from-cyan-500/20 to-cyan-200/10"
          />
          <MetricCard
            label="Tareas abiertas"
            value={data.tasks.filter((task) => !task.completed).length}
            accent="from-amber-500/20 to-amber-200/10"
          />
          <MetricCard
            label="Promesas pendientes"
            value={data.promises.filter((promise) => !promise.fulfilled).length}
            accent="from-rose-500/20 to-rose-200/10"
          />
          <MetricCard
            label="Eventos detectados"
            value={totalEvents}
            accent="from-emerald-500/20 to-emerald-200/10"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <Panel
            title="Ultimos segmentos procesados"
            subtitle="Se actualiza cada 5 segundos con resumen, transcript y cantidades extraidas."
          >
            {loading ? (
              <EmptyState text="Cargando datos del servidor..." />
            ) : data.summaries.length === 0 ? (
              <EmptyState text="Todavia no entraron segmentos procesados. Graba desde el telefono y vuelve a mirar esta pantalla." />
            ) : (
              <div className="space-y-4">
                {data.summaries.map((summary) => (
                  <article
                    key={summary.id}
                    className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                          {formatDate(summary.date)}
                        </p>
                        <h2 className="mt-2 text-lg font-semibold text-slate-900">
                          {summary.content || "Resumen vacio"}
                        </h2>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs uppercase tracking-[0.15em] text-slate-500">
                        <MiniStat
                          label="Tareas"
                          value={summary.conversation.tasks.length}
                        />
                        <MiniStat
                          label="Promesas"
                          value={summary.conversation.promises.length}
                        />
                        <MiniStat
                          label="Eventos"
                          value={summary.conversation.events.length}
                        />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-200">
                      {summary.conversation.transcript ||
                        "No se guardo transcript en este segmento."}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel
              title="Tareas"
              subtitle="Ultimas tareas detectadas por el analisis."
            >
              {loading ? (
                <EmptyState text="Cargando tareas..." />
              ) : data.tasks.length === 0 ? (
                <EmptyState text="Sin tareas detectadas por ahora." />
              ) : (
                <ListItems
                  items={data.tasks.map((task) => ({
                    id: task.id,
                    title: task.description,
                    meta: formatDate(task.createdAt),
                  }))}
                />
              )}
            </Panel>

            <Panel
              title="Promesas"
              subtitle="Compromisos pendientes detectados en las conversaciones."
            >
              {loading ? (
                <EmptyState text="Cargando promesas..." />
              ) : data.promises.length === 0 ? (
                <EmptyState text="Sin promesas pendientes registradas." />
              ) : (
                <ListItems
                  items={data.promises.map((promise) => ({
                    id: promise.id,
                    title: promise.description,
                    meta: promise.person
                      ? `${promise.person} - ${formatDate(promise.createdAt)}`
                      : formatDate(promise.createdAt),
                  }))}
                />
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200/80 bg-[#fffaf4] p-5 shadow-[0_20px_45px_rgba(15,23,42,0.08)] md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/60 bg-gradient-to-br ${accent} px-5 py-5 shadow-sm backdrop-blur`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function ListItems({
  items,
}: {
  items: { id: string; title: string; meta: string }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <h3 className="text-sm font-medium leading-6 text-slate-900">
            {item.title}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            {item.meta}
          </p>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm leading-6 text-slate-500">
      {text}
    </div>
  );
}

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request fallida para ${input}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
