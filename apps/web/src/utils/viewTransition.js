import { batch } from "solid-js";
const viewTranstionMock = {
    finished: Promise.resolve(undefined),
    ready: Promise.resolve(undefined),
    skipTransition: () => { },
    updateCallbackDone: Promise.resolve(undefined),
    types: new Set(),
};
export const viewTransition = (fn) => {
    if (!document.startViewTransition) {
        fn();
        return viewTranstionMock;
    }
    return document.startViewTransition(fn);
};
export const viewTransitionBatched = (fn) => {
    return viewTransition(() => batch(fn));
};
