import { trackMicro } from "@repo/perf";
const TREE_TIMING_THRESHOLD = 1; // ms
export function findNode(root, path) {
    if (!root || path === undefined)
        return undefined;
    if (root.path === path)
        return root;
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        const children = dir.children;
        if (!children || children.length === 0)
            continue;
        for (const child of children) {
            if (child.path === path)
                return child;
            if (child.kind === "dir") {
                stack.push(child);
            }
        }
    }
    return undefined;
}
/**
 * Tracked version of findNode that logs slow lookups
 */
export function findNodeTracked(root, path) {
    return trackMicro("tree:findNode", () => findNode(root, path), {
        metadata: { path },
        threshold: TREE_TIMING_THRESHOLD,
    });
}
