import { batch } from "solid-js";
import { ensureFs } from "./runtime/fsRuntime";
const buildPath = (parentPath, name) => parentPath ? `${parentPath}/${name}` : name;
export const createFsMutations = ({ getActiveSource, setExpanded, setSelectedPath, setSelectedFileSize, setError, getState, refresh, }) => {
    const createDir = async (parentPath, name) => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        try {
            const ctx = await ensureFs(getActiveSource());
            const newPath = buildPath(parentPath, trimmed);
            await ctx.ensureDir(newPath);
            batch(() => {
                setExpanded(parentPath, true);
                setSelectedPath(newPath);
            });
            await refresh();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Failed to create directory");
        }
    };
    const createFile = async (parentPath, name, content) => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        try {
            const ctx = await ensureFs(getActiveSource());
            const newPath = buildPath(parentPath, trimmed);
            const fileContent = content ?? "// empty file";
            await ctx.write(newPath, fileContent);
            batch(() => {
                setExpanded(parentPath, true);
                setSelectedPath(newPath);
                setSelectedFileSize(new Blob([fileContent]).size);
            });
            await refresh();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Failed to create file");
        }
    };
    const deleteNode = async (path) => {
        if (path === "")
            return;
        try {
            const ctx = await ensureFs(getActiveSource());
            await ctx.remove(path, { recursive: true, force: true });
            const state = getState();
            batch(() => {
                if (state.selectedPath === path ||
                    state.selectedPath?.startsWith(`${path}/`)) {
                    setSelectedPath(undefined);
                    setSelectedFileSize(undefined);
                }
            });
            await refresh();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Failed to delete entry");
        }
    };
    return { createDir, createFile, deleteNode };
};
