import { batch, getOwner, onCleanup } from "solid-js";
import { findNode } from "../runtime/tree";
import { createTreePrefetchClient } from "../prefetch/treePrefetchClient";
import { normalizeDirNodeMetadata } from "../utils/treeNodes";
import { scheduleMicrotask } from "../utils/schedule";
export const makeTreePrefetch = ({ state, setDirNode, setLastPrefetchedPath, setBackgroundPrefetching, setBackgroundIndexedFileCount, setPrefetchError, setPrefetchProcessedCount, setPrefetchLastDurationMs, setPrefetchAverageDurationMs, registerDeferredMetadata, }) => {
    const handlePrefetchStatus = (status) => {
        batch(() => {
            setBackgroundPrefetching(status.running || status.pending > 0 || status.deferred > 0);
            setBackgroundIndexedFileCount(status.indexedFileCount);
            setPrefetchProcessedCount(status.processedCount);
            setPrefetchLastDurationMs(status.lastDurationMs);
            setPrefetchAverageDurationMs(status.averageDurationMs);
            if (!status.running && status.pending === 0 && status.deferred === 0) {
                setPrefetchError(undefined);
            }
        });
    };
    const handlePrefetchError = (payload) => {
        setPrefetchError(payload.message);
    };
    const runPrefetchTask = (task, fallbackMessage) => {
        if (!task)
            return;
        return task.catch((error) => {
            handlePrefetchError({
                message: error instanceof Error ? error.message : fallbackMessage,
            });
        });
    };
    const handlePrefetchResult = (payload) => {
        const node = payload.node;
        scheduleMicrotask(() => {
            const latestTree = state.tree;
            if (!latestTree)
                return;
            const latestDir = findNode(latestTree, node.path);
            if (!latestDir || latestDir.kind !== "dir")
                return;
            const normalized = normalizeDirNodeMetadata(node, latestDir.parentPath, latestDir.depth);
            batch(() => {
                setDirNode(node.path, normalized);
                setLastPrefetchedPath(node.path);
            });
        });
    };
    const handleDeferredMetadata = (payload) => {
        registerDeferredMetadata(payload.node);
    };
    const treePrefetchClient = createTreePrefetchClient({
        onDirectoryLoaded: handlePrefetchResult,
        onStatus: handlePrefetchStatus,
        onError: handlePrefetchError,
        onDeferredMetadata: handleDeferredMetadata,
    });
    const disposeTreePrefetchClient = () => treePrefetchClient.dispose();
    if (getOwner()) {
        onCleanup(() => {
            void disposeTreePrefetchClient();
        });
    }
    return {
        treePrefetchClient,
        runPrefetchTask,
        disposeTreePrefetchClient,
    };
};
