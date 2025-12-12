import { For, Show } from "solid-js";
import { Tab } from "./Tab";
export const Tabs = (props) => {
    const labelFor = (value) => props.getLabel ? props.getLabel(value) : value;
    return (<div role="tablist" class="flex items-center gap-1 overflow-x-auto border-b border-zinc-900/70 bg-zinc-950/40 px-2 py-1.5 text-xs">
      <Show when={props.values.length > 0} fallback={<p class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            {props.emptyLabel ?? "Open a file to start editing"}
          </p>}>
        <For each={props.values}>
          {(value) => (<Tab value={value} label={labelFor(value)} isActive={value === props.activeValue} onSelect={props.onSelect} title={value}/>)}
        </For>
      </Show>
    </div>);
};
