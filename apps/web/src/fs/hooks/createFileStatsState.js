/* eslint-disable solid/reactivity */
import { createStore } from "solid-js/store";
export const createFileStatsState = () => {
    const [fileStats, setFileStatsStore] = createStore({});
    const evictFileStatsEntry = (path) => {
        setFileStatsStore(path, undefined);
    };
    const setFileStats = (path, result) => {
        if (!path)
            return;
        setFileStatsStore(path, result);
    };
    const clearParseResults = () => {
        for (const path of Object.keys(fileStats)) {
            evictFileStatsEntry(path);
        }
    };
    return {
        fileStats,
        setFileStats,
        clearParseResults,
    };
};
