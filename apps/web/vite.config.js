import path from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(() => {
    const envDir = path.resolve(__dirname);
    const webPort = Number(process.env.VITE_WEB_PORT) || 3000;
    return {
        envDir,
        plugins: [tailwindcss(), devtools(), solidPlugin()],
        resolve: {
            alias: {
                "~": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            port: webPort,
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
            },
        },
        build: {
            target: "esnext",
            modulePreload: {
                polyfill: false,
            },
        },
        optimizeDeps: {
            exclude: [],
        },
    };
});
