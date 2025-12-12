import { ComlinkPool } from "../../workers/comlinkPool";
import { PrefetchQueue } from "./prefetchQueue";
import { TreePrefetchHandleCloneError, isHandleCloneError } from "./errors";
const createWorkerInstance = () => new Worker(new URL("./treePrefetch.worker.ts", import.meta.url), {
    type: "module",
});
const supportsWorkers = typeof window !== "undefined" && typeof Worker !== "undefined";
const MAX_PREFETCH_WORKERS = 4;
const resolveWorkerCount = () => {
    if (typeof navigator === "undefined") {
        return 1;
    }
    const hardware = navigator.hardwareConcurrency ?? 2;
    return Math.max(1, Math.min(MAX_PREFETCH_WORKERS, hardware));
};
const createNoopTreePrefetchClient = () => ({
    async init() { },
    async seedTree() { },
    async ingestSubtree() { },
    async markDirLoaded() { },
    async dispose() { },
});
export const createTreePrefetchClient = (callbacks) => {
    if (!supportsWorkers) {
        return createNoopTreePrefetchClient();
    }
    const workerCount = resolveWorkerCount();
    const pool = new ComlinkPool(workerCount, createWorkerInstance);
    const queue = new PrefetchQueue({
        workerCount,
        callbacks,
        loadDirectory: (target) => pool.api.loadDirectory(target),
    });
    let destroyed = false;
    let initialized = false;
    return {
        async init(payload) {
            if (destroyed)
                return;
            await queue.resetForSource(payload.source);
            try {
                await pool.broadcast((remote) => remote.init(payload));
            }
            catch (error) {
                if (isHandleCloneError(error)) {
                    throw new TreePrefetchHandleCloneError(error);
                }
                throw error;
            }
            initialized = true;
        },
        async seedTree(tree) {
            if (destroyed || !initialized)
                return;
            await queue.seedTree(tree);
        },
        async ingestSubtree(node) {
            if (destroyed || !initialized)
                return;
            queue.enqueueSubtree(node);
        },
        async markDirLoaded(path) {
            if (destroyed || !initialized)
                return;
            queue.markDirLoaded(path);
        },
        async dispose() {
            if (destroyed)
                return;
            destroyed = true;
            await queue.dispose();
            await pool.broadcast((remote) => remote.dispose());
            await pool.destroy();
        },
    };
};
