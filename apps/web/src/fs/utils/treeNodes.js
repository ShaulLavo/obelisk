export const normalizeDirNodeMetadata = (node, parentPath, depth) => {
    const childParentPath = node.path || undefined;
    return {
        ...node,
        parentPath,
        depth,
        children: node.children.map((child) => {
            if (child.kind === "dir") {
                return normalizeDirNodeMetadata(child, childParentPath, depth + 1);
            }
            return {
                ...child,
                parentPath: childParentPath,
                depth: depth + 1,
            };
        }),
    };
};
export const replaceDirNodeInTree = (current, targetPath, replacement) => {
    if (current.path === targetPath) {
        return replacement;
    }
    let changed = false;
    const children = current.children.map((child) => {
        if (child.kind !== "dir")
            return child;
        const shouldDescend = child.path === targetPath || targetPath.startsWith(`${child.path}/`);
        if (!shouldDescend)
            return child;
        const next = replaceDirNodeInTree(child, targetPath, replacement);
        if (next !== child) {
            changed = true;
        }
        return next;
    });
    if (!changed) {
        return current;
    }
    return {
        ...current,
        children,
    };
};
export const countLoadedDirectories = (root) => {
    if (!root)
        return 0;
    let count = 0;
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        if (dir.isLoaded !== false) {
            count += 1;
        }
        for (const child of dir.children) {
            if (child.kind === "dir") {
                stack.push(child);
            }
        }
    }
    return count;
};
