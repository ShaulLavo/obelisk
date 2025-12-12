import { createSignal } from "solid-js";
export const createPrefetchIndicators = () => {
    const [backgroundPrefetching, setBackgroundPrefetching] = createSignal(false);
    const [backgroundIndexedFileCount, setBackgroundIndexedFileCount] = createSignal(0);
    const [lastPrefetchedPath, setLastPrefetchedPath] = createSignal(undefined);
    const [prefetchError, setPrefetchError] = createSignal(undefined);
    return {
        backgroundPrefetching,
        setBackgroundPrefetching,
        backgroundIndexedFileCount,
        setBackgroundIndexedFileCount,
        lastPrefetchedPath,
        setLastPrefetchedPath,
        prefetchError,
        setPrefetchError,
    };
};
