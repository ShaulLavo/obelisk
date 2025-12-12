const CLONE_ERROR_PATTERN = /object can(?:not| not) be cloned/i;
export const isHandleCloneError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    if (error instanceof DOMException &&
        (error.name === "DataCloneError" || CLONE_ERROR_PATTERN.test(error.message))) {
        return true;
    }
    if (error instanceof Error && CLONE_ERROR_PATTERN.test(error.message)) {
        return true;
    }
    return false;
};
export class TreePrefetchHandleCloneError extends Error {
    constructor(cause) {
        super([
            "Tree prefetch workers require transferable FileSystemDirectoryHandle instances.",
            "This environment cannot clone those handles between threads (WebKit/Tauri limitation).",
            "Background directory prefetching is disabled.",
        ].join(" "));
        this.name = "TreePrefetchHandleCloneError";
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}
