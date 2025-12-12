import { createStore, reconcile } from "solid-js/store";
export const createFoldState = () => {
    const [fileFolds, setFoldsStore] = createStore({});
    const setFolds = (path, folds) => {
        if (!path)
            return;
        if (!folds?.length) {
            setFoldsStore(path, undefined);
            return;
        }
        setFoldsStore(path, folds);
    };
    const clearFolds = () => {
        setFoldsStore(reconcile({}));
    };
    return {
        fileFolds,
        setFolds,
        clearFolds,
    };
};
