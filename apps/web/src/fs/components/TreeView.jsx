import { For, Show } from "solid-js";
import { TreeNode } from "./TreeNode";
export const TreeView = (props) => (<div class="">
    <p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
      Tree
    </p>
    <Show when={!props.loading() && props.tree()} fallback={<p class="text-sm text-zinc-500">
          {props.loading() ? "" : "No filesystem loaded."}
        </p>}>
      {(tree) => (<For each={tree().children}>{(child) => <TreeNode node={child}/>}</For>)}
    </Show>
  </div>);
