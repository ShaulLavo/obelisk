// import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Ghostty, init, FitAddon, } from "ghostty-web";
import { LocalEchoController } from "./localEcho";
import { handleCommand } from "./commands";
export const createTerminalController = async (container, options) => {
    let disposed = false;
    let initialFitRaf = null;
    try {
        await init();
    }
    catch (error) {
        console.error("Failed to initialize terminal", error);
        throw new Error("terminal initialization failed", { cause: error });
    }
    const term = new Ghostty({
        convertEol: true,
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "JetBrains Mono Variable, monospace",
        theme: {
            background: "#0a0a0b",
            foreground: "#e5e5e5",
            black: "#0b0c0f",
            green: "#cbd5e1",
            white: "#f4f4f5",
            blue: "#d4d4d8",
            cursor: "#e4e4e7",
            brightBlack: "#18181b",
        },
    });
    const fitAddon = new FitAddon();
    const echoAddon = new LocalEchoController();
    term.loadAddon(fitAddon);
    term.loadAddon(echoAddon);
    const remeasureRendererFont = () => {
        const renderer = term.renderer;
        renderer?.remeasureFont();
    };
    const startPromptLoop = async () => {
        while (!disposed) {
            const { label, continuation } = options.getPrompt();
            try {
                const input = await echoAddon.read(label, continuation);
                await handleCommand(input, {
                    localEcho: echoAddon,
                    term,
                    ...options.commandContext,
                });
            }
            catch {
                break;
            }
        }
    };
    const fit = () => {
        if (!disposed)
            fitAddon.fit();
    };
    const handleResize = () => {
        remeasureRendererFont();
        fit();
    };
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    const handleViewportResize = () => handleResize();
    term.open(container);
    remeasureRendererFont();
    {
        const observeResize = fitAddon.observeResize;
        observeResize.call(fitAddon);
        initialFitRaf = requestAnimationFrame(() => {
            fit();
            // 2nd pass to catch late layout/font metric settling
            initialFitRaf = requestAnimationFrame(() => {
                fit();
                initialFitRaf = null;
            });
        });
    }
    term.focus();
    echoAddon.println("Welcome to vibe shell");
    echoAddon.println("Type `help` to see available commands.");
    window.addEventListener("resize", handleResize);
    viewport?.addEventListener("resize", handleViewportResize);
    void startPromptLoop();
    return {
        fit,
        dispose: () => {
            disposed = true;
            if (initialFitRaf !== null) {
                cancelAnimationFrame(initialFitRaf);
                initialFitRaf = null;
            }
            window.removeEventListener("resize", handleResize);
            viewport?.removeEventListener("resize", handleViewportResize);
            echoAddon.abortRead("terminal disposed");
            echoAddon.dispose();
            term.dispose();
        },
    };
};
