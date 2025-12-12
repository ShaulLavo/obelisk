import { fileHandleCache } from "./fsRuntime";
export const getCachedFileHandle = (path) => fileHandleCache.get(path);
export async function getOrCreateFileHandle(ctx, path) {
    const cached = fileHandleCache.get(path);
    if (cached)
        return cached;
    const handle = await ctx.getFileHandleForRelative(path, false);
    fileHandleCache.set(path, handle);
    return handle;
}
