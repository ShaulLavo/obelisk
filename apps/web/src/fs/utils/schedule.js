export const scheduleMicrotask = (fn) => {
    if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
    }
    else {
        Promise.resolve().then(fn);
    }
};
