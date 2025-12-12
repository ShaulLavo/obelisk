import { DEFAULT_SOURCE } from "../config/constants";
import { primeFsCache } from "./fsRuntime";
const isValidDirectoryHandle = (handle) => {
    if (!handle || typeof handle !== "object")
        return false;
    // Memory handles lose their methods after IndexedDB serialization
    const h = handle;
    return (typeof h.entries === "function" ||
        typeof h[Symbol.asyncIterator] === "function");
};
export const restoreHandleCache = ({ tree, activeSource, }) => {
    if (!tree)
        return;
    const source = activeSource ?? DEFAULT_SOURCE;
    if (tree.kind === "dir" && isValidDirectoryHandle(tree.handle)) {
        primeFsCache(source, tree.handle);
    }
};
