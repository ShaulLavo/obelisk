import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public", "tree-sitter");
const assets = [
    {
        source: path.join(appRoot, "node_modules", "web-tree-sitter", "tree-sitter.wasm"),
        destination: path.join(publicDir, "tree-sitter.wasm"),
    },
    {
        source: path.join(appRoot, "node_modules", "tree-sitter-javascript", "tree-sitter-javascript.wasm"),
        destination: path.join(publicDir, "tree-sitter-javascript.wasm"),
    },
    {
        source: path.join(appRoot, "node_modules", "tree-sitter-typescript", "tree-sitter-typescript.wasm"),
        destination: path.join(publicDir, "tree-sitter-typescript.wasm"),
    },
    {
        source: path.join(appRoot, "node_modules", "tree-sitter-typescript", "tree-sitter-tsx.wasm"),
        destination: path.join(publicDir, "tree-sitter-tsx.wasm"),
    },
    {
        source: path.join(appRoot, "node_modules", "tree-sitter-typescript", "queries", "highlights.scm"),
        destination: path.join(publicDir, "typescript-highlights.scm"),
    },
];
mkdirSync(publicDir, { recursive: true });
for (const asset of assets) {
    if (!existsSync(asset.source)) {
        throw new Error(`Missing Tree-sitter asset: ${asset.source}`);
    }
    cpSync(asset.source, asset.destination);
}
console.log("Tree-sitter assets copied to", publicDir);
