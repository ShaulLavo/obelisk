import { createStore, reconcile } from "solid-js/store";
export const createErrorState = () => {
    const [fileErrors, setErrorsStore] = createStore({});
    const setErrors = (path, errors) => {
        if (!path)
            return;
        if (!errors?.length) {
            setErrorsStore(path, undefined);
            return;
        }
        setErrorsStore(path, errors);
    };
    const clearErrors = () => {
        setErrorsStore(reconcile({}));
    };
    return {
        fileErrors,
        setErrors,
        clearErrors,
    };
};
