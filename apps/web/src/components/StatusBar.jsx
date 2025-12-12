import { createMemo, Show } from "solid-js";
import { useFs } from "~/fs/context/FsContext";
import { formatBytes } from "@repo/utils";
import { useFocusManager } from "~/focus/focusManager";
const SOURCE_LABELS = {
    local: "Local Folder",
    opfs: "Browser Storage (OPFS)",
    memory: "In-Memory",
};
const FOCUS_LABELS = {
    global: "Global",
    editor: "Editor",
    terminal: "Terminal",
    fileTree: "File Tree",
};
const FOCUS_BADGE_STYLES = {
    global: "border-zinc-700/60 bg-zinc-900 text-zinc-200",
    editor: "border-blue-500/40 bg-blue-500/10 text-blue-100",
    terminal: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
    fileTree: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};
export const StatusBar = () => {
    const [state] = useFs();
    const focus = useFocusManager();
    const filePath = createMemo(() => state.selectedPath ?? "No file selected");
    const sizeLabel = createMemo(() => {
        if (!state.selectedPath)
            return "--";
        return state.selectedFileSize !== undefined
            ? formatBytes(state.selectedFileSize)
            : "calculating...";
    });
    const statusIndicator = createMemo(() => {
        if (state.error) {
            return {
                label: state.error,
                class: "border-red-900/60 bg-red-900/30 text-red-200 shadow-[0_0_10px_rgba(248,113,113,0.2)]",
            };
        }
        if (state.loading) {
            return {
                label: "Loading filesystem...",
                class: "border-amber-500/40 bg-amber-500/10 text-amber-200",
            };
        }
        return {
            label: state.selectedPath ? "Ready" : "Idle",
            class: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
        };
    });
    const focusDescriptor = createMemo(() => {
        const area = focus.activeArea();
        return {
            label: FOCUS_LABELS[area] ?? "Global",
            class: FOCUS_BADGE_STYLES[area] ?? FOCUS_BADGE_STYLES.global,
        };
    });
    const backgroundIndicator = createMemo(() => {
        if (state.prefetchError) {
            return {
                label: state.prefetchError,
                class: "border-red-900/60 bg-red-900/30 text-red-200 shadow-[0_0_6px_rgba(248,113,113,0.35)]",
                showSpinner: false,
            };
        }
        const indexedFileCount = state.backgroundIndexedFileCount;
        if (state.backgroundPrefetching) {
            return {
                label: `Indexed ${indexedFileCount} files`,
                class: "border-blue-500/40 bg-blue-500/10 text-blue-100",
                showSpinner: true,
            };
        }
        if (indexedFileCount > 0) {
            return {
                label: `Indexed ${indexedFileCount} files`,
                class: "border-zinc-700/60 bg-zinc-900 text-zinc-200/80",
                showSpinner: false,
            };
        }
        return undefined;
    });
    return (<div class="rounded-lg border border-zinc-800/70 bg-zinc-950/70 py-1 text-xs text-zinc-200 shadow-inner">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
            File
          </span>
          <span class="truncate font-mono text-xs text-zinc-100">
            {filePath()}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
            Size
          </span>
          <span class="text-xs font-semibold text-zinc-100">{sizeLabel()}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
            Source
          </span>
          <span class="text-xs font-semibold text-zinc-100">
            {SOURCE_LABELS[state.activeSource]}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
            Status
          </span>
          <span class={`rounded border px-1.5 py-0.5 text-[8px] font-semibold ${statusIndicator().class}`}>
            {statusIndicator().label}
          </span>
        </div>

        <Show when={backgroundIndicator()}>
          {(indicator) => (<div class="flex items-center gap-1.5">
              <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
                Prefetch
              </span>
              <span class={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-semibold ${indicator().class}`}>
                <Show when={indicator().showSpinner}>
                  <span aria-hidden="true" class="mr-1 h-2 w-2 animate-spin rounded-full border border-current border-t-transparent"/>
                </Show>
                {indicator().label}
              </span>
            </div>)}
        </Show>

        <div class="flex items-center gap-1.5">
          <span class="text-[8px] uppercase tracking-[0.08em] text-zinc-500">
            Focus
          </span>
          <span class={`rounded border px-1.5 py-0.5 text-[8px] font-semibold transition duration-150 ${focusDescriptor().class}`}>
            {focusDescriptor().label}
          </span>
        </div>
      </div>
    </div>);
};
