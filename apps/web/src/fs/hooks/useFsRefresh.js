import { batch } from "solid-js";
import { ensureFs, buildTree, LocalDirectoryFallbackSwitchError, } from "../runtime/fsRuntime";
import { DEFAULT_SOURCE } from "../config/constants";
import { findNode } from "../runtime/tree";
export const useFsRefresh = ({ state, setTree, setExpanded, setActiveSource, setError, setLoading, clearParseResults, clearPieceTables, clearFileCache, clearDeferredMetadata, setBackgroundPrefetching, setBackgroundIndexedFileCount, setLastPrefetchedPath, ensureDirLoaded, buildEnsurePaths, treePrefetchClient, runPrefetchTask, selectPath, }) => {
    const getRestorableFilePath = (tree) => {
        const candidates = [state.selectedPath, state.lastKnownFilePath].filter((path) => typeof path === "string");
        for (const candidate of candidates) {
            const node = findNode(tree, candidate);
            if (node?.kind === "file") {
                return node.path;
            }
        }
        return undefined;
    };
    const refresh = async (initialSource = state.activeSource ?? DEFAULT_SOURCE) => {
        let source = initialSource;
        for (;;) {
            setLoading(true);
            clearParseResults();
            clearPieceTables();
            clearFileCache();
            clearDeferredMetadata();
            const ensurePaths = buildEnsurePaths();
            try {
                const fsCtx = await ensureFs(source);
                const built = await buildTree(source, {
                    expandedPaths: state.expanded,
                    ensurePaths,
                });
                const restorablePath = getRestorableFilePath(built);
                batch(() => {
                    setTree(built);
                    setActiveSource(source);
                    setExpanded((expanded) => ({
                        ...expanded,
                        [built.path]: expanded[built.path] ?? true,
                    }));
                    setError(undefined);
                });
                await treePrefetchClient.init({
                    source,
                    rootHandle: fsCtx.root,
                    rootPath: built.path ?? "",
                    rootName: built.name || "root",
                });
                runPrefetchTask(treePrefetchClient.seedTree(built), "Failed to seed prefetch worker");
                for (const [expandedPath, isOpen] of Object.entries(state.expanded)) {
                    if (isOpen) {
                        void ensureDirLoaded(expandedPath);
                    }
                }
                if (restorablePath) {
                    await selectPath(restorablePath, { forceReload: true });
                }
                return;
            }
            catch (error) {
                if (error instanceof LocalDirectoryFallbackSwitchError) {
                    source = error.nextSource;
                    continue;
                }
                batch(() => {
                    setError(error instanceof Error
                        ? error.message
                        : "Failed to load filesystem");
                    setBackgroundPrefetching(false);
                    setBackgroundIndexedFileCount(0);
                    setLastPrefetchedPath(undefined);
                });
                return;
            }
            finally {
                setLoading(false);
            }
        }
    };
    return {
        refresh,
    };
};
