import { createMinimalBinaryParseResult, detectBinaryFromPreview, getPieceTableOriginalText, parseFileBuffer, } from "@repo/utils";
import { DEFAULT_SOURCE } from "../fs/config/constants";
import { readFilePreviewBytes, readFileText } from "../fs/runtime/streaming";
import { findNode } from "../fs/runtime/tree";
import { ANSI } from "./constants";
import { printColumns } from "./utils";
const DISPLAY_ROOT = "/";
const formatPath = (path) => path ? `${DISPLAY_ROOT}${path}` : DISPLAY_ROOT;
const normalizePath = (cwd, input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed === ".")
        return cwd;
    if (trimmed === DISPLAY_ROOT)
        return "";
    const base = trimmed.startsWith(DISPLAY_ROOT) ? "" : cwd;
    const combined = [base, trimmed].filter(Boolean).join(DISPLAY_ROOT);
    const segments = combined.split(DISPLAY_ROOT).filter(Boolean);
    const stack = [];
    for (const segment of segments) {
        if (segment === ".")
            continue;
        if (segment === "..") {
            if (stack.length === 0) {
                throw new Error("Path escapes root");
            }
            stack.pop();
            continue;
        }
        stack.push(segment);
    }
    return stack.join(DISPLAY_ROOT);
};
const getParentPath = (path) => {
    const idx = path.lastIndexOf(DISPLAY_ROOT);
    if (idx === -1)
        return "";
    return path.slice(0, idx);
};
const getName = (path) => {
    const idx = path.lastIndexOf(DISPLAY_ROOT);
    if (idx === -1)
        return path;
    return path.slice(idx + 1);
};
const ensureTreeReady = (ctx) => {
    if (!ctx.shell.state.tree) {
        ctx.localEcho?.println("Filesystem not ready. Try again in a moment.");
        return false;
    }
    return true;
};
const ensureDir = async (ctx, path) => {
    const dir = await ctx.shell.actions.ensureDirPathLoaded(path);
    if (dir)
        return dir;
    ctx.localEcho?.println(`No such directory: ${formatPath(path)}`);
    return undefined;
};
const findNodeInTree = (state, path) => {
    const tree = state.tree;
    if (!tree)
        return undefined;
    return findNode(tree, path);
};
const ensureFileNode = async (ctx, path) => {
    const parentPath = getParentPath(path);
    const parentDir = await ensureDir(ctx, parentPath);
    if (!parentDir)
        return undefined;
    const node = findNodeInTree(ctx.shell.state, path);
    if (!node) {
        ctx.localEcho?.println(`No such file: ${formatPath(path)}`);
        return undefined;
    }
    if (node.kind !== "file") {
        ctx.localEcho?.println(`Not a file: ${formatPath(path)}`);
        return undefined;
    }
    return node;
};
const printHelp = (ctx) => {
    ctx.localEcho?.println("Available commands:");
    printColumns(ctx.localEcho, [
        ["help", "Show this help text"],
        ["clear", "Clear the terminal output"],
        ["pwd", "Print working directory"],
        ["cd <path>", "Change directory"],
        ["ls [path]", "List directory contents"],
        ["cat <file>", "Print file contents"],
        ["open <file>", "Open file in editor"],
        ["mkdir <path>", "Create a directory"],
        ["touch <path>", "Create an empty file"],
        ["rm <path>", "Delete a file or directory"],
        ["echo", "Echo back the provided text"],
    ]);
};
const handlePwd = (ctx) => {
    ctx.localEcho?.println(formatPath(ctx.shell.getCwd()));
};
const clearTerminal = (ctx) => {
    ctx.term?.write(`${ANSI.clear}${ANSI.clearScrollback}${ANSI.cursorHome}`);
};
const handleCd = async (ctx, rawPath) => {
    const cwd = ctx.shell.getCwd();
    const target = rawPath ? normalizePath(cwd, rawPath) : "";
    const dir = await ensureDir(ctx, target);
    if (!dir)
        return;
    ctx.shell.setCwd(target);
};
const handleLs = async (ctx, rawPath) => {
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = rawPath ? normalizePath(cwd, rawPath) : cwd;
    const parentPath = getParentPath(target);
    const parentDir = await ensureDir(ctx, parentPath);
    if (!parentDir)
        return;
    const existing = findNodeInTree(ctx.shell.state, target);
    if (existing?.kind === "file") {
        ctx.localEcho?.println(existing.name);
        return;
    }
    const dir = await ensureDir(ctx, target);
    if (!dir)
        return;
    const children = dir.children ?? [];
    if (children.length === 0) {
        ctx.localEcho?.println("");
        return;
    }
    const labels = children.map((child) => child.kind === "dir" ? `${child.name}/` : child.name);
    ctx.localEcho?.printWide(labels.sort());
};
const handleCat = async (ctx, rawPath) => {
    if (!rawPath) {
        ctx.localEcho?.println("Usage: cat <file>");
        return;
    }
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = normalizePath(cwd, rawPath);
    const node = await ensureFileNode(ctx, target);
    if (!node)
        return;
    const cached = ctx.shell.actions.fileCache.get(target);
    if (cached.stats?.contentKind === "binary") {
        ctx.localEcho?.println("cat: binary file not displayed");
        return;
    }
    if (cached.pieceTable) {
        ctx.localEcho?.println(getPieceTableOriginalText(cached.pieceTable));
        return;
    }
    const source = ctx.shell.state.activeSource ?? DEFAULT_SOURCE;
    const previewBytes = cached.previewBytes ?? (await readFilePreviewBytes(source, target, 4096));
    const detection = detectBinaryFromPreview(target, previewBytes);
    if (!detection.isText) {
        if (!cached.stats || !cached.previewBytes) {
            ctx.shell.actions.fileCache.set(target, {
                stats: createMinimalBinaryParseResult("", detection),
                previewBytes,
            });
        }
        ctx.localEcho?.println("cat: binary file not displayed");
        return;
    }
    const text = await readFileText(source, target);
    const stats = cached.stats ??
        parseFileBuffer(text, {
            path: target,
            textHeuristic: detection,
        });
    if (!cached.stats || !cached.previewBytes) {
        ctx.shell.actions.fileCache.set(target, {
            stats,
            previewBytes,
        });
    }
    ctx.localEcho?.println(text);
};
const handleOpen = async (ctx, rawPath) => {
    if (!rawPath) {
        ctx.localEcho?.println("Usage: open <file>");
        return;
    }
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = normalizePath(cwd, rawPath);
    const node = await ensureFileNode(ctx, target);
    if (!node)
        return;
    await ctx.shell.actions.selectPath(target, { forceReload: true });
    ctx.localEcho?.println(`Opened ${formatPath(target)}`);
};
const handleMkdir = async (ctx, rawPath) => {
    if (!rawPath) {
        ctx.localEcho?.println("Usage: mkdir <path>");
        return;
    }
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = normalizePath(cwd, rawPath);
    const parentPath = getParentPath(target);
    const name = getName(target);
    if (!name) {
        ctx.localEcho?.println("mkdir: invalid path");
        return;
    }
    const parentDir = await ensureDir(ctx, parentPath);
    if (!parentDir)
        return;
    await ctx.shell.actions.createDir(parentPath, name);
    ctx.localEcho?.println(`Created ${formatPath(target)}`);
};
const handleTouch = async (ctx, rawPath) => {
    if (!rawPath) {
        ctx.localEcho?.println("Usage: touch <path>");
        return;
    }
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = normalizePath(cwd, rawPath);
    const parentPath = getParentPath(target);
    const name = getName(target);
    if (!name) {
        ctx.localEcho?.println("touch: invalid path");
        return;
    }
    const parentDir = await ensureDir(ctx, parentPath);
    if (!parentDir)
        return;
    await ctx.shell.actions.createFile(parentPath, name, "");
    ctx.localEcho?.println(`Created ${formatPath(target)}`);
};
const handleRm = async (ctx, rawPath) => {
    if (!rawPath) {
        ctx.localEcho?.println("Usage: rm <path>");
        return;
    }
    if (!ensureTreeReady(ctx))
        return;
    const cwd = ctx.shell.getCwd();
    const target = normalizePath(cwd, rawPath);
    if (target === "") {
        ctx.localEcho?.println("rm: refusing to remove root");
        return;
    }
    const parentPath = getParentPath(target);
    const parentDir = await ensureDir(ctx, parentPath);
    if (!parentDir)
        return;
    const node = findNodeInTree(ctx.shell.state, target);
    if (!node) {
        ctx.localEcho?.println(`rm: no such file or directory: ${formatPath(target)}`);
        return;
    }
    await ctx.shell.actions.deleteNode(target);
    ctx.localEcho?.println(`Removed ${formatPath(target)}`);
};
export const handleCommand = async (input, ctx) => {
    if (!ctx.localEcho || !ctx.term)
        return;
    const trimmed = input.trim();
    if (!trimmed)
        return;
    const [command, ...args] = trimmed.split(/\s+/);
    try {
        switch (command) {
            case "help":
                printHelp(ctx);
                break;
            case "echo":
                ctx.localEcho.println(args.join(" "));
                break;
            case "clear":
                clearTerminal(ctx);
                break;
            case "pwd":
                handlePwd(ctx);
                break;
            case "cd":
                await handleCd(ctx, args[0]);
                break;
            case "ls":
                await handleLs(ctx, args[0]);
                break;
            case "cat":
                await handleCat(ctx, args[0]);
                break;
            case "open":
                await handleOpen(ctx, args[0]);
                break;
            case "mkdir":
                await handleMkdir(ctx, args[0]);
                break;
            case "touch":
                await handleTouch(ctx, args[0]);
                break;
            case "rm":
                await handleRm(ctx, args[0]);
                break;
            default:
                ctx.localEcho.println(`Command not found: ${command}`);
        }
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unexpected error running command";
        ctx.localEcho.println(message);
    }
};
