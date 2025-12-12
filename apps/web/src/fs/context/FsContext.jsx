import { createContext, useContext } from "solid-js";
export const FsContext = createContext();
export function useFs() {
    const ctx = useContext(FsContext);
    if (!ctx) {
        throw new Error("useFs must be used within an FsProvider");
    }
    return ctx;
}
