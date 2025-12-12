import { batch } from "solid-js";
import { createMinimalBinaryParseResult, detectBinaryFromPreview, parseFileBuffer, createPieceTableSnapshot, getPieceTableText, } from "@repo/utils";
import { loggers } from "@repo/logger";
import { trackOperation } from "@repo/perf";
import { getFileSize, readFilePreviewBytes, readFileBuffer, } from "../runtime/streaming";
import { DEFAULT_SOURCE } from "../config/constants";
import { findNode } from "../runtime/tree";
import { parseBufferWithTreeSitter } from "../../treeSitter/workerClient";
const textDecoder = new TextDecoder();
const MAX_FILE_SIZE_BYTES = Infinity;
export const useFileSelection = ({ state, setSelectedPath, setSelectedFileSize, setSelectedFilePreviewBytes, setSelectedFileContent, setSelectedFileLoading, setError, fileCache, }) => {
    let selectRequestId = 0;
    const handleReadError = (error) => {
        if (error instanceof DOMException && error.name === "AbortError")
            return;
        setError(error instanceof Error ? error.message : "Failed to read file");
    };
    const selectPath = async (path, options) => {
        const tree = state.tree;
        if (!tree)
            return;
        if (state.selectedPath === path && !options?.forceReload)
            return;
        if (options?.forceReload) {
            fileCache.clearPath(path);
        }
        const node = findNode(tree, path);
        if (!node)
            return;
        if (node.kind === "dir") {
            batch(() => {
                setSelectedPath(path);
                setSelectedFileSize(undefined);
                setSelectedFileLoading(false);
            });
            return;
        }
        const requestId = ++selectRequestId;
        setSelectedFileLoading(true);
        const source = state.activeSource ?? DEFAULT_SOURCE;
        const perfMetadata = { path, source };
        try {
            await trackOperation("fs:selectPath", async ({ timeSync, timeAsync }) => {
                const fileSize = await timeAsync("get-file-size", () => getFileSize(source, path));
                perfMetadata.fileSize = fileSize;
                if (requestId !== selectRequestId)
                    return;
                let selectedFileContentValue = "";
                let pieceTableSnapshot;
                let fileStatsResult;
                let binaryPreviewBytes;
                if (fileSize > MAX_FILE_SIZE_BYTES) {
                    // Skip processing for large files
                }
                else {
                    const previewBytes = await timeAsync("read-preview-bytes", () => readFilePreviewBytes(source, path));
                    if (requestId !== selectRequestId)
                        return;
                    const { pieceTable: existingSnapshot, stats: existingFileStats } = fileCache.get(path);
                    const detection = detectBinaryFromPreview(path, previewBytes);
                    const isBinary = !detection.isText;
                    if (existingSnapshot) {
                        selectedFileContentValue = getPieceTableText(existingSnapshot);
                        fileStatsResult =
                            existingFileStats ??
                                timeSync("parse-file-buffer", () => parseFileBuffer(selectedFileContentValue, {
                                    path,
                                    textHeuristic: detection,
                                }));
                        pieceTableSnapshot = existingSnapshot;
                    }
                    else if (isBinary) {
                        binaryPreviewBytes = previewBytes;
                        fileStatsResult =
                            existingFileStats ??
                                timeSync("binary-file-metadata", () => createMinimalBinaryParseResult("", detection));
                    }
                    else {
                        const buffer = await timeAsync("read-file-buffer", () => readFileBuffer(source, path));
                        if (requestId !== selectRequestId)
                            return;
                        const textBytes = new Uint8Array(buffer);
                        const text = textDecoder.decode(textBytes);
                        selectedFileContentValue = text;
                        const parseResultPromise = parseBufferWithTreeSitter(path, buffer);
                        if (parseResultPromise) {
                            void parseResultPromise
                                .then((result) => {
                                if (requestId !== selectRequestId)
                                    return;
                                if (result) {
                                    fileCache.set(path, {
                                        highlights: result.captures,
                                        folds: result.folds,
                                        brackets: result.brackets,
                                        errors: result.errors,
                                    });
                                }
                            })
                                .catch((error) => {
                                loggers.fs.error("[Tree-sitter worker] parse failed", path, error);
                            });
                        }
                        fileStatsResult = timeSync("parse-file-buffer", () => parseFileBuffer(text, {
                            path,
                            textHeuristic: detection,
                        }));
                        if (fileStatsResult.contentKind === "text") {
                            pieceTableSnapshot = timeSync("create-piece-table", () => createPieceTableSnapshot(text));
                        }
                    }
                }
                timeSync("apply-selection-state", ({ timeSync }) => {
                    batch(() => {
                        timeSync("set-selected-path", () => setSelectedPath(path));
                        timeSync("clear-error", () => setError(undefined));
                        timeSync("set-selected-file-size", () => setSelectedFileSize(fileSize));
                        timeSync("set-selected-file-preview-bytes", () => setSelectedFilePreviewBytes(binaryPreviewBytes));
                        timeSync("set-selected-file-content", () => setSelectedFileContent(selectedFileContentValue));
                        if (pieceTableSnapshot || fileStatsResult || binaryPreviewBytes) {
                            timeSync("set-cache-entry", () => fileCache.set(path, {
                                pieceTable: pieceTableSnapshot,
                                stats: fileStatsResult,
                                previewBytes: binaryPreviewBytes,
                            }));
                        }
                    });
                });
            }, {
                metadata: perfMetadata,
                logger: loggers.fs,
            }).catch((error) => {
                if (requestId !== selectRequestId)
                    return;
                handleReadError(error);
            });
        }
        finally {
            if (requestId === selectRequestId) {
                setSelectedFileLoading(false);
            }
        }
    };
    const updateSelectedFilePieceTable = (updater) => {
        const path = state.lastKnownFilePath;
        if (!path)
            return;
        const current = state.selectedFilePieceTable;
        const next = updater(current);
        if (!next)
            return;
        fileCache.set(path, { pieceTable: next });
    };
    const updateSelectedFileHighlights = (highlights) => {
        const path = state.lastKnownFilePath;
        if (!path)
            return;
        fileCache.set(path, { highlights });
    };
    const updateSelectedFileFolds = (folds) => {
        const path = state.lastKnownFilePath;
        if (!path)
            return;
        fileCache.set(path, { folds });
    };
    const updateSelectedFileBrackets = (brackets) => {
        const path = state.lastKnownFilePath;
        if (!path)
            return;
        fileCache.set(path, { brackets });
    };
    const updateSelectedFileErrors = (errors) => {
        const path = state.lastKnownFilePath;
        if (!path)
            return;
        fileCache.set(path, { errors });
    };
    return {
        selectPath,
        updateSelectedFilePieceTable,
        updateSelectedFileHighlights,
        updateSelectedFileFolds,
        updateSelectedFileBrackets,
        updateSelectedFileErrors,
    };
};
