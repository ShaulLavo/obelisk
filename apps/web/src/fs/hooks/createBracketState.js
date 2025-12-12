import { createStore, reconcile } from "solid-js/store";
export const createBracketState = () => {
    const [fileBrackets, setBracketsStore] = createStore({});
    const setBrackets = (path, brackets) => {
        if (!path)
            return;
        if (!brackets?.length) {
            setBracketsStore(path, undefined);
            return;
        }
        setBracketsStore(path, brackets);
    };
    const clearBrackets = () => {
        setBracketsStore(reconcile({}));
    };
    return {
        fileBrackets,
        setBrackets,
        clearBrackets,
    };
};
