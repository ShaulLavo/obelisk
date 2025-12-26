const BRACKET_DEPTH_COUNT = 6

const normalizeDepthIndex = (depth: number) => {
	const normalized = Math.max(depth - 1, 0)
	return normalized % BRACKET_DEPTH_COUNT
}

/**
 * Get the CSS class for bracket text at the given depth.
 */
export const getBracketDepthTextClass = (depth: number): string => {
	const normalized = normalizeDepthIndex(depth)
	return `bracket-depth-${normalized}`
}

/**
 * Get the CSS class for bracket borders at the given depth.
 */
export const getBracketDepthBorderClass = (depth: number): string => {
	const normalized = normalizeDepthIndex(depth)
	return `bracket-border-${normalized}`
}
