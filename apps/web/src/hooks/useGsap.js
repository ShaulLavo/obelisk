import { createEffect, onCleanup, onMount } from "solid-js";
import gsap from "gsap";
let _gsap = gsap;
const isConfig = (value) => !!value && typeof value === "object" && !Array.isArray(value);
export function useGSAP(callbackOrConfig, maybeConfig) {
    let callback;
    let config = {};
    if (typeof callbackOrConfig === "function") {
        callback = callbackOrConfig;
        if (isConfig(maybeConfig))
            config = maybeConfig;
    }
    else if (isConfig(callbackOrConfig)) {
        config = callbackOrConfig;
    }
    const { scope, deps, revertOnUpdate = false } = config;
    let context = null;
    const ensureContext = () => {
        if (!context) {
            context = _gsap.context(() => { }, scope ?? undefined);
        }
        return context;
    };
    const contextSafe = (fn) => {
        const ctx = ensureContext();
        return ctx.add(fn);
    };
    const runCallback = () => {
        if (!callback)
            return;
        const ctx = ensureContext();
        callback(ctx, contextSafe);
    };
    const trackDeps = () => {
        if (!deps)
            return;
        if (Array.isArray(deps)) {
            for (const d of deps)
                d();
        }
        else {
            deps();
        }
    };
    if (deps) {
        createEffect(() => {
            trackDeps();
            if (revertOnUpdate && context) {
                context.revert();
                context = null;
            }
            runCallback();
            onCleanup(() => {
                if (!revertOnUpdate && context) {
                    context.revert();
                    context = null;
                }
            });
        });
    }
    else {
        onMount(() => {
            runCallback();
            onCleanup(() => {
                if (context) {
                    context.revert();
                    context = null;
                }
            });
        });
    }
    return {
        context: () => context,
        contextSafe,
    };
}
useGSAP.register = (core) => {
    _gsap = core;
};
