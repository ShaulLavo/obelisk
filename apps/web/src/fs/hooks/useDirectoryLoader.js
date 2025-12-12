import { batch } from "solid-js";
import { findNode } from "../runtime/tree";
import { buildTree } from "../runtime/fsRuntime";
import { DEFAULT_SOURCE } from "../config/constants";
import { normalizeDirNodeMetadata } from "../utils/treeNodes";
export const useDirectoryLoader = ({ state, setExpanded, setSelectedPath, setError, setDirNode, runPrefetchTask, treePrefetchClient, }) => {
    const subtreeLoads = new Map();
    const buildEnsurePaths = () => {
        const paths = new Set();
        const selectedNode = state.selectedNode;
        if (selectedNode?.kind === "file") {
            paths.add(selectedNode.path);
        }
        const lastFilePath = state.lastKnownFilePath;
        if (lastFilePath) {
            paths.add(lastFilePath);
        }
        return Array.from(paths);
    };
    const ensureDirLoaded = (path) => {
        if (!state.tree)
            return;
        const existing = findNode(state.tree, path);
        if (!existing || existing.kind !== "dir")
            return;
        if (existing.isLoaded !== false)
            return;
        const inflight = subtreeLoads.get(path);
        if (inflight)
            return inflight;
        const expandedSnapshot = { ...state.expanded, [path]: true };
        const ensurePaths = buildEnsurePaths();
        const load = (async () => {
            try {
                const source = state.activeSource ?? DEFAULT_SOURCE;
                const subtree = await buildTree(source, {
                    rootPath: path,
                    expandedPaths: expandedSnapshot,
                    ensurePaths,
                    operationName: "fs:buildSubtree",
                });
                const latest = state.tree ? findNode(state.tree, path) : undefined;
                if (!latest || latest.kind !== "dir")
                    return;
                const normalized = normalizeDirNodeMetadata(subtree, latest.parentPath, latest.depth);
                setDirNode(path, normalized);
                runPrefetchTask(treePrefetchClient.ingestSubtree(normalized), "Failed to sync prefetch worker");
            }
            catch (error) {
                setError(error instanceof Error
                    ? error.message
                    : "Failed to load directory contents");
            }
            finally {
                subtreeLoads.delete(path);
            }
        })();
        subtreeLoads.set(path, load);
        return load;
    };
    const toggleDir = (path) => {
        const next = !state.expanded[path];
        batch(() => {
            setExpanded(path, next);
            setSelectedPath(path);
        });
        if (next) {
            void ensureDirLoaded(path);
        }
    };
    return {
        buildEnsurePaths,
        ensureDirLoaded,
        toggleDir,
    };
};
