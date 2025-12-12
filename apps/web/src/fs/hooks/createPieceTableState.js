/* eslint-disable solid/reactivity */
import { createStore, reconcile } from "solid-js/store";
export const createPieceTableState = () => {
    const [pieceTables, setPieceTablesStore] = createStore({});
    const evictPieceTableEntry = (path) => {
        setPieceTablesStore(path, undefined);
    };
    const setPieceTable = (path, snapshot) => {
        if (!path)
            return;
        if (!snapshot) {
            evictPieceTableEntry(path);
            return;
        }
        setPieceTablesStore(path, snapshot);
    };
    const clearPieceTables = () => {
        setPieceTablesStore(reconcile({}));
    };
    return {
        pieceTables,
        setPieceTable,
        clearPieceTables,
    };
};
