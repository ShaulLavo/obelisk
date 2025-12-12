import { buildFsTree, createFs, getRootDirectory, DirectoryPickerUnavailableError, } from "@repo/fs";
import { loggers } from "@repo/logger";
import { trackOperation } from "@repo/perf";
import { toast } from "@repo/ui/toaster";
import { OPFS_ROOT_NAME } from "../config/constants";
import { requestLocalDirectoryFallback } from "../fallback/localDirectoryFallbackCoordinator";
const fsCache = {};
const initPromises = {};
export class LocalDirectoryFallbackSwitchError extends Error {
    nextSource;
    constructor(nextSource) {
        super(`Switch to ${nextSource}`);
        this.nextSource = nextSource;
        this.name = "LocalDirectoryFallbackSwitchError";
    }
}
export const fileHandleCache = new Map();
let awaitingPermissionToastId = null;
const showAwaitingPermissionToast = () => {
    if (awaitingPermissionToastId !== null)
        return;
    awaitingPermissionToastId = toast("Waiting for permission", {
        description: "Click or press a key to continue the directory picker.",
        duration: Infinity,
    });
};
const clearAwaitingPermissionToast = () => {
    if (awaitingPermissionToastId === null)
        return;
    toast.dismiss(awaitingPermissionToastId);
    awaitingPermissionToastId = null;
};
export function invalidateFs(source) {
    delete fsCache[source];
    delete initPromises[source];
}
export async function ensureFs(source) {
    if (fsCache[source])
        return fsCache[source];
    if (!initPromises[source]) {
        initPromises[source] = trackOperation("fs:ensureFs:init", async ({ timeAsync, timeSync }) => {
            const rootHandle = await timeAsync("get-root", async () => {
                try {
                    return await getRootDirectory(source, OPFS_ROOT_NAME, {
                        onAwaitingInteraction: showAwaitingPermissionToast,
                    });
                }
                catch (error) {
                    if (source === "local" &&
                        error instanceof DirectoryPickerUnavailableError) {
                        const fallback = await requestLocalDirectoryFallback("unsupported");
                        if (fallback.nextSource && fallback.nextSource !== source) {
                            primeFsCache(fallback.nextSource, fallback.handle);
                            throw new LocalDirectoryFallbackSwitchError(fallback.nextSource);
                        }
                        return fallback.handle;
                    }
                    throw error;
                }
            }).finally(() => {
                clearAwaitingPermissionToast();
            });
            fsCache[source] = timeSync("create-fs", () => createFs(rootHandle));
        }, { metadata: { source }, logger: loggers.fs });
    }
    await initPromises[source];
    return fsCache[source];
}
export function primeFsCache(source, rootHandle) {
    fsCache[source] = createFs(rootHandle);
    initPromises[source] = Promise.resolve();
}
const collectAncestorPaths = (paths) => {
    const ancestors = new Set();
    if (!paths)
        return ancestors;
    for (const raw of paths) {
        if (!raw)
            continue;
        const segments = raw.split("/").filter(Boolean);
        let current = "";
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            ancestors.add(current);
        }
    }
    return ancestors;
};
const createShouldDescend = (expandedPaths, ensurePaths) => {
    const hasExpansionControls = Boolean(expandedPaths);
    const ancestors = collectAncestorPaths(ensurePaths);
    const hasAncestors = ancestors.size > 0;
    if (!hasExpansionControls && !hasAncestors) {
        return undefined;
    }
    return (node) => {
        if (node.depth === 0)
            return true;
        if (expandedPaths?.[node.path])
            return true;
        return ancestors.has(node.path);
    };
};
const deriveRootName = (rootPath) => {
    if (!rootPath)
        return OPFS_ROOT_NAME;
    const segments = rootPath.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? OPFS_ROOT_NAME;
};
export async function buildTree(source, options) {
    const rootPath = options?.rootPath ?? "";
    const rootName = options?.rootName ?? deriveRootName(rootPath);
    const operationName = options?.operationName ?? "fs:buildTree";
    const shouldDescend = createShouldDescend(options?.expandedPaths, options?.ensurePaths);
    return trackOperation(operationName, async ({ timeAsync }) => {
        const ctx = await timeAsync("ensure-fs", () => ensureFs(source));
        const root = await timeAsync("build-fs-tree", () => buildFsTree(ctx, { path: rootPath, name: rootName }, { shouldDescend }));
        return root;
    }, { metadata: { source, rootPath }, logger: loggers.fs });
}
export { createFileTextStream, getFileSize, readFilePreviewBytes, readFileText, safeReadFileText, streamFileText, } from "./streaming";
