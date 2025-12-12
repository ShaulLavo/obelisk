import { For, Show, createMemo, createSignal, onCleanup, onMount, } from "solid-js";
import { createStore } from "solid-js/store";
import { formatNumber, runStoreBenchmarks } from "./runStoreBenchmarks";
import { subscribeStoreBenchEvents, } from "./storeBenchEvents";
const formatDuration = (ms) => {
    if (ms == null || Number.isNaN(ms))
        return "0.00s";
    return `${(ms / 1000).toFixed(2)}s`;
};
const formatBytes = (bytes) => {
    if (bytes >= 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
};
const formatCount = (value) => value == null ? "…" : value.toLocaleString("en-US");
const describeScenario = (scenario) => {
    if (scenario.category === "raw-binary") {
        const chunkBytes = scenario.chunkBytes ?? scenario.valueBytes;
        const operations = scenario.operations ?? scenario.items;
        return `${formatCount(operations)} ops • ${formatBytes(chunkBytes)} chunk • random offsets`;
    }
    const parts = [
        `${formatCount(scenario.items)} items`,
        `${formatBytes(scenario.valueBytes)} value`,
        scenario.order,
    ];
    if (scenario.valueKind === "arrayBuffer") {
        parts.push("ArrayBuffer");
    }
    return parts.join(" • ");
};
const scenarioStatusLabel = {
    queued: "Queued",
    running: "Running",
    complete: "Complete",
};
const scenarioStatusClass = {
    queued: "text-zinc-400",
    running: "text-amber-300",
    complete: "text-emerald-300",
};
const logKindClass = {
    "run-start": "text-sky-300",
    "run-complete": "text-emerald-300",
    "scenario-start": "text-amber-300",
    "scenario-complete": "text-emerald-300",
    "adapter-start": "text-sky-300",
    "adapter-complete": "text-emerald-200",
    info: "text-zinc-300",
    error: "text-rose-300",
};
const statusLabel = {
    idle: "Preparing worker…",
    running: "Running benchmarks",
    completed: "Completed",
    skipped: "Skipped",
    error: "Failed",
};
const statusBadgeClass = {
    idle: "bg-zinc-700 text-zinc-200 ring-1 ring-zinc-600",
    running: "bg-amber-400/10 text-amber-200 ring-1 ring-amber-400/40 animate-pulse",
    completed: "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/40",
    skipped: "bg-zinc-700 text-zinc-300 ring-1 ring-zinc-600",
    error: "bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/40",
};
export const StoreBenchDashboard = () => {
    const [status, setStatus] = createSignal("idle");
    const [errorMessage, setErrorMessage] = createSignal(null);
    const [scenarioOrder, setScenarioOrder] = createSignal([]);
    const [currentScenario, setCurrentScenario] = createSignal(null);
    const [scenarios, setScenarios] = createStore({});
    const [logs, setLogs] = createSignal([]);
    const [elapsedMs, setElapsedMs] = createSignal(0);
    const [startedAt, setStartedAt] = createSignal(null);
    const [finishedAt, setFinishedAt] = createSignal(null);
    let timerId;
    let nextLogId = 0;
    let unsubscribe;
    onMount(() => {
        void runStoreBenchmarks();
    });
    const scenarioEntries = createMemo(() => scenarioOrder()
        .map((name) => scenarios[name])
        .filter((entry) => Boolean(entry)));
    const completedCount = createMemo(() => scenarioEntries().filter((entry) => entry.status === "complete").length);
    const totalElapsedMs = createMemo(() => {
        if (startedAt() != null && finishedAt() != null) {
            return finishedAt() - startedAt();
        }
        return elapsedMs();
    });
    const startTimer = (startTime) => {
        if (timerId != null) {
            window.clearInterval(timerId);
        }
        setStartedAt(startTime);
        setFinishedAt(null);
        setElapsedMs(Math.max(0, Date.now() - startTime));
        timerId = window.setInterval(() => {
            setElapsedMs(Math.max(0, Date.now() - startTime));
        }, 100);
    };
    const stopTimer = (finishTime) => {
        if (timerId != null) {
            window.clearInterval(timerId);
            timerId = undefined;
        }
        if (startedAt() != null) {
            const end = finishTime ?? Date.now();
            setElapsedMs(Math.max(0, end - (startedAt() ?? 0)));
            setFinishedAt(end);
        }
    };
    const pushLog = (message, kind, timestamp, scenarioName, adapter) => {
        setLogs((current) => {
            const next = [
                ...current,
                {
                    id: nextLogId++,
                    timestamp,
                    message,
                    kind,
                    scenarioName,
                    adapter,
                },
            ];
            if (next.length > 200) {
                return next.slice(next.length - 200);
            }
            return next;
        });
    };
    const updateScenarioState = (scenario, updates = {}) => {
        setScenarios(scenario.name, (prev) => {
            const next = {
                scenario: prev?.scenario ?? scenario,
                status: prev?.status ?? "queued",
                results: prev?.results ?? [],
                durationMs: prev?.durationMs,
            };
            if (updates.status)
                next.status = updates.status;
            if (updates.results !== undefined)
                next.results = updates.results;
            if (updates.durationMs != null)
                next.durationMs = updates.durationMs;
            return next;
        });
    };
    const resetDashboardState = () => {
        if (timerId != null) {
            window.clearInterval(timerId);
            timerId = undefined;
        }
        nextLogId = 0;
        setStatus("idle");
        setErrorMessage(null);
        setScenarioOrder([]);
        setCurrentScenario(null);
        setLogs([]);
        setElapsedMs(0);
        setStartedAt(null);
        setFinishedAt(null);
        setScenarios(() => ({}));
    };
    const handleEvent = (event) => {
        switch (event.type) {
            case "reset":
                resetDashboardState();
                break;
            case "manifest": {
                const manifest = event.payload.scenarios;
                setScenarioOrder(() => manifest.map((item) => item.name));
                for (const scenario of manifest) {
                    updateScenarioState(scenario, { status: "queued", results: [] });
                }
                pushLog(`Loaded ${manifest.length} scenario${manifest.length === 1 ? "" : "s"}`, "info", event.timestamp);
                break;
            }
            case "progress": {
                const payload = event.payload;
                pushLog(payload.message, payload.kind, event.timestamp, payload.scenario?.name, payload.adapter);
                if (payload.kind === "run-start") {
                    setStatus("running");
                    startTimer(event.timestamp);
                }
                if (payload.kind === "scenario-start" && payload.scenario) {
                    updateScenarioState(payload.scenario, { status: "running" });
                    setCurrentScenario(payload.scenario.name);
                }
                if (payload.kind === "scenario-complete") {
                    setCurrentScenario(null);
                }
                if (payload.kind === "run-complete") {
                    setCurrentScenario(null);
                    stopTimer(event.timestamp);
                }
                break;
            }
            case "scenario-complete":
                updateScenarioState(event.payload.scenario, {
                    status: "complete",
                    results: event.payload.results,
                    durationMs: event.payload.durationMs,
                });
                break;
            case "results":
                setStatus("completed");
                stopTimer(event.timestamp);
                pushLog(`Benchmarks finished (${event.payload.length} scenario${event.payload.length === 1 ? "" : "s"})`, "info", event.timestamp);
                break;
            case "skipped": {
                const message = event.reason ?? "no available adapters";
                setStatus("skipped");
                stopTimer(event.timestamp);
                setErrorMessage(message);
                pushLog(`[skipped] ${message}`, "info", event.timestamp);
                break;
            }
            case "error":
                setStatus("error");
                stopTimer(event.timestamp);
                setErrorMessage(event.error.message);
                pushLog(event.error.message, "error", event.timestamp);
                break;
        }
    };
    onMount(() => {
        unsubscribe = subscribeStoreBenchEvents(handleEvent);
    });
    onCleanup(() => {
        if (timerId != null)
            window.clearInterval(timerId);
        unsubscribe?.();
    });
    return (<div class="min-h-screen bg-[#050608] px-6 py-8 text-zinc-100">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header class="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg shadow-black/40">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm uppercase tracking-[0.2em] text-zinc-500">
                Virtual FS store benchmark
              </p>
              <h1 class="mt-2 text-3xl font-semibold text-white">
                Storage adapter shootout
              </h1>
              <p class="mt-1 text-sm text-zinc-400">
                Comparing OPFS async/sync + IndexedDB adapters with multiple
                scenarios.
              </p>
              <p class="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {completedCount()} / {scenarioEntries().length || "…"} scenarios
                done
              </p>
            </div>
            <div class="flex flex-col items-end gap-2 text-right">
              <div class="flex items-center gap-3 text-sm text-zinc-300">
                <div class="flex items-center gap-2 font-mono text-lg text-zinc-100">
                  <Show when={status() === "running"}>
                    <span class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent"/>
                  </Show>
                  {formatDuration(totalElapsedMs())}
                </div>
                <span class={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass[status()]}`}>
                  {statusLabel[status()]}
                </span>
              </div>
              <Show when={currentScenario()}>
                <p class="text-sm text-amber-200">
                  Running scenario {currentScenario()}
                </p>
              </Show>
              <Show when={errorMessage()}>
                <p class="text-sm text-rose-300">{errorMessage()}</p>
              </Show>
            </div>
          </div>
        </header>

        <section class="grid gap-4 md:grid-cols-2">
          <Show when={scenarioEntries().length > 0} fallback={<div class="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/60 p-6 text-center text-sm text-zinc-400">
                Waiting for worker manifest…
              </div>}>
            <For each={scenarioEntries()}>
              {(entry) => {
            const winner = entry.results.length > 0
                ? entry.results.reduce((best, current) => current.totalMs < best.totalMs ? current : best).store
                : null;
            return (<article class="rounded-2xl border border-zinc-900 bg-zinc-900/70 p-4 shadow-lg shadow-black/30">
                    <header class="flex items-start justify-between gap-4">
                      <div>
                        <h2 class="text-xl font-semibold text-white">
                          {entry.scenario.name}
                        </h2>
                        <p class="text-sm text-zinc-400">
                          {describeScenario(entry.scenario)}
                        </p>
                      </div>
                      <div class="text-right text-sm">
                        <p class={scenarioStatusClass[entry.status]}>
                          {scenarioStatusLabel[entry.status]}
                        </p>
                        <Show when={entry.durationMs != null}>
                          <p class="text-xs text-zinc-500">
                            {formatDuration(entry.durationMs)} elapsed
                          </p>
                        </Show>
                      </div>
                    </header>
                    <Show when={entry.results.length > 0} fallback={<p class="mt-6 text-sm text-zinc-500">
                          Awaiting adapter results…
                        </p>}>
                      <div class="mt-4 overflow-x-auto">
                        <table class="w-full text-left text-sm text-zinc-200">
                          <thead>
                            <tr class="text-xs uppercase tracking-wide text-zinc-500">
                              <th class="pb-2 font-medium">Store</th>
                              <th class="pb-2 font-medium">Write</th>
                              <th class="pb-2 font-medium">Read</th>
                              <th class="pb-2 font-medium">Remove</th>
                              <th class="pb-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={entry.results}>
                              {(result) => {
                    const isWinner = winner === result.store;
                    return (<tr class={`text-sm ${isWinner
                            ? "bg-emerald-500/10 text-emerald-100"
                            : "text-zinc-200"}`}>
                                    <td class="py-1 font-medium">
                                      {result.store}
                                    </td>
                                    <td class="py-1 font-mono text-xs">
                                      {formatNumber(result.writeMs)} ms
                                    </td>
                                    <td class="py-1 font-mono text-xs">
                                      {formatNumber(result.readMs)} ms
                                    </td>
                                    <td class="py-1 font-mono text-xs">
                                      {formatNumber(result.removeMs)} ms
                                    </td>
                                    <td class="py-1 font-mono text-xs font-semibold">
                                      {formatNumber(result.totalMs)} ms
                                    </td>
                                  </tr>);
                }}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </Show>
                  </article>);
        }}
            </For>
          </Show>
        </section>

        <section class="rounded-2xl border border-zinc-900 bg-zinc-900/70 p-4 shadow-lg shadow-black/30">
          <header class="mb-3 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">Live logs</h3>
              <p class="text-sm text-zinc-500">
                Tap into worker progress + adapter updates
              </p>
            </div>
            <span class="text-xs text-zinc-500">{logs().length} events</span>
          </header>
          <div class="max-h-64 overflow-y-auto pr-2">
            <Show when={logs().length > 0} fallback={<p class="text-sm text-zinc-500">Awaiting worker events…</p>}>
              <For each={logs()}>
                {(log) => (<div class="flex items-start gap-3 py-1 text-sm">
                    <span class="w-20 text-xs font-mono text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span class={`text-[11px] font-semibold uppercase tracking-wide ${logKindClass[log.kind]}`}>
                      {log.kind}
                    </span>
                    <div class="flex-1 text-zinc-200">
                      {log.message}
                      <Show when={log.scenarioName}>
                        <span class="text-zinc-500">
                          {" "}
                          ({log.scenarioName}
                          <Show when={log.adapter}>{` • ${log.adapter}`}</Show>)
                        </span>
                      </Show>
                    </div>
                  </div>)}
              </For>
            </Show>
          </div>
        </section>
      </div>
    </div>);
};
