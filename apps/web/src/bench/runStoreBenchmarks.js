import { emitStoreBenchEvent } from "./storeBenchEvents";
export const formatNumber = (value, digits = 2) => Number(value.toFixed(digits));
export const runStoreBenchmarks = async (handlers = {}) => {
    emitStoreBenchEvent({ type: "reset" });
    if (typeof Worker === "undefined") {
        const reason = "Worker API is unavailable";
        console.info("[store bench] skipped: Worker API is unavailable");
        emitStoreBenchEvent({ type: "skipped", reason });
        handlers.onSkipped?.(reason);
        return;
    }
    await new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./vfsStoreBench.worker.ts", import.meta.url), { type: "module" });
        const cleanup = () => {
            worker.terminate();
        };
        worker.onmessage = (event) => {
            const message = event.data;
            if (!message || typeof message !== "object")
                return;
            switch (message.type) {
                case "manifest":
                    emitStoreBenchEvent({ type: "manifest", payload: message.payload });
                    handlers.onManifest?.(message.payload.scenarios);
                    return;
                case "progress":
                    console.info("[store bench]", message.payload.message);
                    emitStoreBenchEvent({ type: "progress", payload: message.payload });
                    handlers.onProgress?.(message.payload);
                    return;
                case "scenario-complete":
                    emitStoreBenchEvent({
                        type: "scenario-complete",
                        payload: message.payload,
                    });
                    handlers.onScenarioComplete?.(message.payload);
                    return;
                case "results":
                    emitStoreBenchEvent({ type: "results", payload: message.payload });
                    handlers.onComplete?.(message.payload);
                    cleanup();
                    resolve();
                    return;
                case "skipped": {
                    const reason = message.reason ?? "no available adapters";
                    console.info(`[store bench] skipped: ${reason}`);
                    emitStoreBenchEvent({ type: "skipped", reason });
                    handlers.onSkipped?.(reason);
                    cleanup();
                    resolve();
                    return;
                }
                case "error": {
                    const error = new Error(message.error);
                    emitStoreBenchEvent({ type: "error", error });
                    handlers.onError?.(error);
                    cleanup();
                    reject(error);
                    return;
                }
            }
        };
        worker.onerror = (event) => {
            const error = event.error instanceof Error
                ? event.error
                : new Error(event.message ?? "Unknown worker error");
            console.error("[store bench] worker error", error);
            emitStoreBenchEvent({ type: "error", error });
            handlers.onError?.(error);
            cleanup();
            reject(error);
        };
        worker.postMessage({ type: "run" });
    });
};
