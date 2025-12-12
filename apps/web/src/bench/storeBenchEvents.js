const HISTORY_LIMIT = 512;
const listeners = new Set();
const history = [];
const addToHistory = (event) => {
    if (event.type === "reset") {
        history.length = 0;
        history.push(event);
        return;
    }
    history.push(event);
    if (history.length > HISTORY_LIMIT) {
        history.shift();
    }
};
export const emitStoreBenchEvent = (event) => {
    const timedEvent = {
        ...event,
        timestamp: Date.now(),
    };
    addToHistory(timedEvent);
    for (const listener of listeners) {
        try {
            listener(timedEvent);
        }
        catch {
            // Ignore listener errors to prevent one failure from breaking the event loop
        }
    }
    return timedEvent;
};
export const subscribeStoreBenchEvents = (listener, options) => {
    const replay = options?.replay ?? true;
    // Register listener before replay to avoid missing events emitted during replay
    listeners.add(listener);
    if (replay) {
        // Replay from a snapshot to iterate over a stable copy
        const snapshot = history.slice();
        for (const event of snapshot) {
            try {
                listener(event);
            }
            catch {
                // Ignore listener errors during replay to prevent breaking the replay loop
            }
        }
    }
    return () => {
        listeners.delete(listener);
    };
};
export const getStoreBenchEventHistory = () => [...history];
