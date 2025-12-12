import { createSignal } from "solid-js";
export const createFileDisplayState = () => {
    const [selectedFileSize, setSelectedFileSize] = createSignal(undefined);
    const [selectedFilePreviewBytes, setSelectedFilePreviewBytes] = createSignal(undefined);
    const [selectedFileContent, setSelectedFileContent] = createSignal("");
    const [selectedFileLoading, setSelectedFileLoading] = createSignal(false);
    const [error, setError] = createSignal(undefined);
    const [loading, setLoading] = createSignal(false);
    return {
        selectedFileSize,
        setSelectedFileSize,
        selectedFilePreviewBytes,
        setSelectedFilePreviewBytes,
        selectedFileContent,
        setSelectedFileContent,
        selectedFileLoading,
        setSelectedFileLoading,
        error,
        setError,
        loading,
        setLoading,
    };
};
