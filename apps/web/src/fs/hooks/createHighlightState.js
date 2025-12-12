import { createStore, reconcile } from "solid-js/store";
export const createHighlightState = () => {
    const [fileHighlights, setHighlightsStore] = createStore({});
    const setHighlights = (path, highlights) => {
        if (!path)
            return;
        if (!highlights?.length) {
            setHighlightsStore(path, undefined);
            return;
        }
        setHighlightsStore(path, highlights);
    };
    const clearHighlights = () => {
        setHighlightsStore(reconcile({}));
    };
    return {
        fileHighlights,
        setHighlights,
        clearHighlights,
    };
};
