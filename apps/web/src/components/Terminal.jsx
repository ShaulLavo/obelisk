import { createResizeObserver } from "@solid-primitives/resize-observer";
import { makePersisted } from "@solid-primitives/storage";
import { createSignal, onCleanup, onMount } from "solid-js";
import { useFocusManager } from "~/focus/focusManager";
import { useFs } from "~/fs/context/FsContext";
import { dualStorage } from "~/utils/DualStorage";
import { createPrompt } from "../terminal/prompt";
import { createTerminalController, } from "../terminal/terminalController";
export const Terminal = () => {
    let containerRef = null;
    const focus = useFocusManager();
    const [state, actions] = useFs();
    const storage = typeof window === "undefined" ? undefined : dualStorage;
    const [cwd, setCwd] = makePersisted(
    // eslint-disable-next-line solid/reactivity
    createSignal(""), {
        name: "terminal-cwd",
        storage,
    });
    const normalizeCwd = (path) => {
        if (!path || path === "/")
            return "";
        return path.replace(/^[/\\]+/, "");
    };
    onMount(() => {
        const unregisterFocus = focus.registerArea("terminal", () => containerRef);
        let controller;
        createResizeObserver(() => containerRef, () => controller?.fit());
        const setup = async () => {
            controller = await createTerminalController(containerRef, {
                getPrompt: () => createPrompt(cwd(), state.activeSource),
                commandContext: {
                    shell: {
                        state,
                        actions,
                        getCwd: () => cwd(),
                        setCwd: (path) => setCwd(() => normalizeCwd(path)),
                    },
                },
            });
            controller.fit();
            const dir = await actions.ensureDirPathLoaded(cwd());
            if (!dir) {
                setCwd(() => "");
            }
        };
        void setup().catch((error) => {
            console.error("Failed to initialize terminal controller", error);
        });
        onCleanup(() => {
            controller?.dispose();
            unregisterFocus();
        });
    });
    return (<div class="terminal-container relative h-full min-h-0 px-2" ref={containerRef}/>);
};
