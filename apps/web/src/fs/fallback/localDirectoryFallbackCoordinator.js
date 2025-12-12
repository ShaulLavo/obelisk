let handler = null;
export function registerLocalDirectoryFallback(fn) {
    handler = fn;
}
export function unregisterLocalDirectoryFallback(fn) {
    if (handler === fn) {
        handler = null;
    }
}
export function requestLocalDirectoryFallback(reason) {
    if (!handler) {
        return Promise.reject(new Error("Local directory fallback handler is not registered."));
    }
    return handler(reason);
}
