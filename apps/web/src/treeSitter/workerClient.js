import { releaseProxy, transfer, wrap } from "comlink";
const supportsWorkers = typeof window !== "undefined" && typeof Worker !== "undefined";
const createTreeSitterWorker = () => new Worker(new URL("../workers/treeSitter.worker.ts", import.meta.url), {
    type: "module",
});
let workerHandle = null;
let workerInitPromise = null;
const getWorkerHandle = () => {
    if (!supportsWorkers)
        return null;
    if (!workerHandle) {
        const worker = createTreeSitterWorker();
        const proxy = wrap(worker);
        workerHandle = { worker, proxy };
    }
    return workerHandle;
};
export const ensureTreeSitterWorkerReady = async () => {
    const handle = getWorkerHandle();
    if (!handle)
        return null;
    if (!workerInitPromise) {
        workerInitPromise = handle.proxy.init().catch((error) => {
            workerInitPromise = null;
            throw error;
        });
    }
    await workerInitPromise;
    return handle;
};
export const disposeTreeSitterWorker = async () => {
    if (!workerHandle)
        return;
    try {
        await workerHandle.proxy.dispose();
    }
    catch {
        // ignore dispose errors
    }
    workerHandle.proxy[releaseProxy]?.();
    workerHandle.worker.terminate();
    workerHandle = null;
    workerInitPromise = null;
};
export const parseSourceWithTreeSitter = async (source) => {
    const handle = await ensureTreeSitterWorkerReady();
    if (!handle)
        return undefined;
    return handle.proxy.parse(source);
};
export const parseBufferWithTreeSitter = async (path, buffer) => {
    const handle = await ensureTreeSitterWorkerReady();
    if (!handle)
        return undefined;
    const payload = transfer({ path, buffer }, [buffer]);
    return handle.proxy.parseBuffer(payload);
};
export const applyTreeSitterEdit = async (payload) => {
    const handle = await ensureTreeSitterWorkerReady();
    if (!handle)
        return undefined;
    return handle.proxy.applyEdit(payload);
};
