import { createStore } from "solid-js/store";
export const createTreeState = () => {
    const [tree, setTree] = createStore(undefined);
    return {
        tree,
        setTree,
    };
};
