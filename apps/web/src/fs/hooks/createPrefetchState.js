import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { createPrefetchIndicators } from "./createPrefetchIndicators";
export const createPrefetchState = () => {
    const { backgroundPrefetching, setBackgroundPrefetching, backgroundIndexedFileCount, setBackgroundIndexedFileCount, lastPrefetchedPath, setLastPrefetchedPath, prefetchError, setPrefetchError, } = createPrefetchIndicators();
    const [prefetchProcessedCount, setPrefetchProcessedCount] = createSignal(0);
    const [prefetchLastDurationMs, setPrefetchLastDurationMs] = createSignal(0);
    const [prefetchAverageDurationMs, setPrefetchAverageDurationMs] = createSignal(0);
    const [deferredMetadata, setDeferredMetadata] = createStore({});
    const registerDeferredMetadata = (node) => {
        const key = node.path || `${node.parentPath ?? ""}/${node.name}`;
        setDeferredMetadata(key, () => node);
    };
    const clearDeferredMetadata = () => {
        setDeferredMetadata(() => ({}));
    };
    return {
        backgroundPrefetching,
        setBackgroundPrefetching,
        backgroundIndexedFileCount,
        setBackgroundIndexedFileCount,
        lastPrefetchedPath,
        setLastPrefetchedPath,
        prefetchError,
        setPrefetchError,
        prefetchProcessedCount,
        setPrefetchProcessedCount,
        prefetchLastDurationMs,
        setPrefetchLastDurationMs,
        prefetchAverageDurationMs,
        setPrefetchAverageDurationMs,
        deferredMetadata,
        registerDeferredMetadata,
        clearDeferredMetadata,
    };
};
